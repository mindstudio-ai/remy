/**
 * Headless mode — stdin/stdout JSON protocol for programmatic control.
 *
 * Designed for parent processes like the mindstudio-sandbox C&C server.
 * Input: newline-delimited JSON on stdin  (e.g. {"action":"message","requestId":"r1","text":"..."})
 * Output: newline-delimited JSON on stdout (e.g. {"event":"text","requestId":"r1","text":"..."})
 *
 * Protocol rules:
 * - Every stdin command includes an `action` and a caller-provided `requestId`.
 * - Every stdout event that is a response to a command includes the `requestId`.
 * - System events (ready, session_restored, stopping, stopped) never have a requestId.
 * - Every command ends with exactly one `completed` event:
 *   {event:"completed", requestId, success:true|false, error?:string}
 * - When contiguous queued user/background messages merge into one turn, the
 *   turn's primary requestId gets the real `completed` first, then each other
 *   absorbed requestId gets one `{...same outcome, absorbed:true}` completed
 *   immediately after — one terminal per command either way.
 * - `tool_result` is fire-and-forget (resolves an in-flight promise, no completed event).
 *
 * `get_history` is paginated. Request: {action:"get_history", before?:number,
 * limit?:number, requestId}. `before` is an exclusive upper bound on message
 * index (defaults to end of array — the most recent messages); `limit` caps
 * page size (default 500, hard cap 2000). Response: {event:"history",
 * messages, startIndex, endIndex, totalMessageCount, ...}. Walk backward by
 * passing the previous response's `startIndex` as the next `before`. When
 * `startIndex === 0`, no older messages remain. Indices are GLOBAL — they span
 * the sealed session archives followed by the live tail (see getHistoryPage in
 * session.ts), so scrollback continues past a rotation to the conversation
 * start, not just to the start of the live (post-rotation) array.
 */

import { createLogger } from '../logger.js';
import type { Attachment, Message } from '../api.js';
import { resolveConfig } from '../config.js';
import { initOrgContext } from '../orgContext.js';
import { buildSystemPrompt } from '../prompt/index.js';
import {
  triggerCompaction,
  applyPendingSummaries,
  setCompactionListener,
  getInflightCompaction,
  formatSummariesResult,
} from '../compaction/trigger.js';
import { triggerBrandExtraction } from '../brandExtraction/trigger.js';
import { setLspBaseUrl } from '../tools/_helpers/lsp.js';
import {
  createAgentState,
  runTurn,
  type AgentState,
  type AgentEvent,
  type TurnEntry,
} from '../agent.js';
import {
  loadSession,
  clearSession,
  saveSession,
  getHistoryPage,
} from '../session.js';
import {
  ALLOWED_MODELS_BY_TYPE,
  getEffectiveModelSurfaces,
  resolveModel,
} from '../models/surfaces.js';
import type { StdinCommand } from '../types.js';
import { ToolRegistry, USER_CANCELLED_RESULT } from '../toolRegistry.js';
import { persistAttachments, buildUploadHeader } from './attachments.js';
import { applyPlanFileSideEffect } from './planFile.js';
import {
  createSessionStats,
  loadQueue,
  loadPassiveResults,
  writeStats,
  type SessionStats,
  type PassiveResult,
} from './stats.js';
import { getToolByName } from '../tools/index.js';
import { MessageQueue, type QueuedMessage } from './messageQueue.js';
import { resolveAction, getActionChain } from '../automatedActions/resolve.js';
import {
  sentinel,
  hasSentinel,
  isAutomatedMessage,
  buildBackgroundResultsMessage,
  mergeBackgroundResultsMessages,
} from '../automatedActions/sentinel.js';

const log = createLogger('headless');

export interface HeadlessOptions {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  lspUrl?: string;
}

const EXTERNAL_TOOL_TIMEOUT_MS = 300_000; // 5 minutes

// Tools that wait on user input — no timeout
const USER_FACING_TOOLS = new Set([
  'promptUser',
  'confirmDestructiveAction',
  'presentPublishPlan',
]);

interface PendingTool {
  resolve: (result: string) => void;
  timeout?: ReturnType<typeof setTimeout>;
}

interface BlockUpdate {
  toolCallId: string;
  result: string;
  subAgentMessages?: Message[];
}

/**
 * If the most recent API call's input size exceeds this threshold, the next
 * turn forces a blocking compaction before proceeding. The 1M-token API cap
 * leaves ~150k of headroom for tool round-trips inside the upcoming turn —
 * raising this gets risky, lowering it triggers compaction more often.
 */
const FORCED_COMPACTION_THRESHOLD_TOKENS = 850_000;

/**
 * Encapsulates all state and behavior for a headless session. State is
 * held on instance fields (not closure variables) so mutations are
 * explicit and greppable. Callbacks passed to external code
 * (onEvent, onBackgroundComplete, resolveExternalTool, handleStdinLine,
 * shutdown) are arrow-method fields so `this` is preserved.
 */
export class HeadlessSession {
  // Configuration
  private opts: HeadlessOptions;
  private config!: ReturnType<typeof resolveConfig>;

  // Conversation state
  private state: AgentState = createAgentState();
  private sessionStats: SessionStats = createSessionStats();

  // Turn lifecycle
  private running = false;
  private currentAbort: AbortController | null = null;

  /** RequestId of the in-flight message command — injected into streamed events. */
  private currentRequestId: string | undefined;

  /** Guard: track whether terminal `completed` was already sent so we emit
   * exactly one per requestId. */
  private completedEmitted = false;
  /** Outcome of the current turn's primary `completed` — read after the turn
   * to stamp the same success/error onto absorbed requestIds' terminals. */
  private lastCompleted: { success: boolean; error?: string } | null = null;
  private turnStart = 0;

  /**
   * Onboarding state of the currently-running turn. Captured at runSingleTurn
   * start so onBackgroundComplete can enqueue background results with the
   * right state (the triggering turn's state, not a stale one).
   */
  private currentOnboardingState: string | undefined;

  /**
   * Unified message queue. Holds pending work to deliver after the current
   * turn completes: chained automated actions, background sub-agent results,
   * and user messages sent while a turn is running. Strict FIFO. Persisted
   * to .remy-stats.json so queued work survives process restarts.
   */
  private queue!: MessageQueue;

  /**
   * Holding pen for passive background results (tools with
   * `backgroundNotify: 'passive'`, e.g. specSync). Deliberately outside the
   * message queue: pen contents never initiate a turn, never latch the
   * sandbox's queue-derived busy state, and never trigger resume-on-restart.
   * Swept into the next real turn as a hidden background_results entry.
   * Persisted to .remy-stats.json alongside the queue.
   */
  private passivePen: PassiveResult[] = [];

  // External tool bridge
  private pendingTools = new Map<string, PendingTool>();
  private earlyResults = new Map<string, string>();

  // Tool block updates from background completions (separate from the message queue)
  private pendingBlockUpdates: BlockUpdate[] = [];

  /**
   * Id of the UI-only tool block synthesized for the in-flight user/gate
   * compaction (see the compaction listener). Model-invoked compactions have
   * a real block and never set this. Single slot — triggerCompaction is
   * single-flight.
   */
  private syntheticCompactionId: string | null = null;

  // Tool lifecycle management — shared across all nesting depths
  private toolRegistry = new ToolRegistry();

  // IO — accumulates stdin bytes between newline boundaries
  private stdinBuffer = '';

  constructor(opts: HeadlessOptions = {}) {
    this.opts = opts;
  }

  //////////////////////////////////////////////////////////////////////////////
  // Lifecycle
  //////////////////////////////////////////////////////////////////////////////
  async start(): Promise<void> {
    // Redirect console to stderr so stdout stays clean for the JSON protocol
    const stderrWrite = (...args: unknown[]) => {
      process.stderr.write(args.map(String).join(' ') + '\n');
    };
    console.log = stderrWrite;
    console.warn = stderrWrite;
    console.info = stderrWrite;

    // Wire LSP
    if (this.opts.lspUrl) {
      setLspBaseUrl(this.opts.lspUrl);
    }

    this.config = resolveConfig({
      apiKey: this.opts.apiKey,
      baseUrl: this.opts.baseUrl,
    });

    // Warm the build-time org context before any buildSystemPrompt call
    // (per-message / compaction). Best-effort — never blocks or throws.
    await initOrgContext(this.config);

    const resumed = loadSession(this.state);

    // Rehydrate the queue from disk — persisted on every change. Every
    // mutation also emits `queue_changed`, the single source of truth for
    // queue state (snapshot always included, even when empty).
    this.queue = new MessageQueue(loadQueue(), () => {
      this.persistStats();
      this.emit('queue_changed', { queuedMessages: this.queue.snapshot() });
    });
    this.passivePen = loadPassiveResults();
    // Rewrite stats at boot: sessionStats starts fresh in memory, so this
    // clears a stale `compactionInProgress: true` left on disk by a crash
    // mid-compaction (compaction itself never survives a restart) — otherwise
    // the frontend's stats fallback would show "Compacting…" forever.
    this.persistStats();

    if (resumed) {
      this.emit('session_restored', {
        messageCount: this.state.messages.length,
        ...(this.state.models && { models: this.state.models }),
        modelSurfaces: getEffectiveModelSurfaces(),
        allowedModelsByType: ALLOWED_MODELS_BY_TYPE,
      });
    }

    // Cold-start brand extraction. The hash check inside the trigger makes
    // this a no-op when `.remy-brand.json` is already up to date; it covers
    // (a) projects loaded with brand spec but no extracted JSON yet, and
    // (b) spec files edited outside the agent (IDE) since last session.
    triggerBrandExtraction(
      this.config,
      resolveModel('brandExtractor', this.state.models, this.opts.model),
    );

    // Wire registry events through the same onEvent handler
    this.toolRegistry.onEvent = this.onEvent;

    // Single listener handles all compaction lifecycle: stdout events for the
    // frontend + sessionStats updates for `.remy-stats.json`. Callers don't
    // emit or update stats themselves — they just call triggerCompaction.
    setCompactionListener((event) => {
      if (event.type === 'started') {
        this.emit(
          'compaction_started',
          { blocking: event.blocking },
          event.requestId,
        );
        this.sessionStats.compactionInProgress = true;
        this.persistStats();

        // User/gate compactions have no tool block of their own — synthesize
        // a UI-only one so every compaction renders as a normal tool call
        // (standard tool row, ToolList, ToolDetail; summary lands in
        // backgroundResult on completion). Never for 'tool' origin (a real
        // block exists), and never mid-turn for /compact — appending an
        // assistant message between a running turn's tool_use message and
        // its tool_result messages would corrupt pairing for the session.
        // The gate origin is safe while `running`: it fires before runTurn
        // pushes anything for the upcoming turn. `uiOnly` keeps the message
        // out of every API payload (cleanMessagesForApi); `result` is set so
        // the Agents-tab pending predicate resolves once backgroundResult
        // lands.
        const safeToSynthesize =
          event.origin === 'gate' || (event.origin === 'user' && !this.running);
        if (!event.toolCallId && safeToSynthesize) {
          const id = `compact_${Date.now()}`;
          this.syntheticCompactionId = id;
          this.state.messages.push({
            role: 'assistant',
            content: [
              {
                type: 'tool',
                id,
                name: 'compactConversation',
                input: {},
                startedAt: Date.now(),
                background: true,
                uiOnly: true,
                result: 'Compaction started in the background.',
              },
            ],
          });
          // Persist now — a reload mid-compaction must still show the row.
          saveSession(this.state);
          this.onEvent({
            type: 'tool_start',
            id,
            name: 'compactConversation',
            input: {},
            background: true,
          });
          // Mirror a real backgroundOnly tool's event sequence: execute
          // returns its ack → tool_done sets `result` on the live block.
          // Without this the frontend's live block keeps result == null and
          // the Agents-tab pending predicate (isBg || result == null) spins
          // forever after completion.
          this.onEvent({
            type: 'tool_done',
            id,
            name: 'compactConversation',
            result: 'Compaction started in the background.',
            isError: false,
          });
        }
      } else {
        const data = event.error ? { error: event.error } : {};
        this.emit('compaction_complete', data, event.requestId);

        // Resolve the synthesized block (success and failure alike) through
        // the normal background-completion path — compactConversation is
        // backgroundNotify 'silent', so this updates the block and emits
        // tool_background_complete without ever telling the model.
        if (this.syntheticCompactionId) {
          const id = this.syntheticCompactionId;
          this.syntheticCompactionId = null;
          this.onBackgroundComplete(
            id,
            'compactConversation',
            event.error
              ? `Error: ${event.error}`
              : formatSummariesResult(event.summaries ?? []),
          );
        }
        this.sessionStats.compactionInProgress = false;
        // Only a compaction that actually shrank the context may disarm the
        // forced gate. Zeroing this on the error path too let a session whose
        // summaries kept failing grow past the threshold unchecked, since the
        // gate re-arms a turn late off the next call's input size.
        if (!event.error) {
          this.sessionStats.lastContextSize = 0;
        }
        this.sessionStats.messageCount = this.state.messages.length;
        this.persistStats();
        // Messages that arrived during the compaction were queued (see
        // handleMessage). Kick the drain on success AND failure so they never
        // strand; the pre-turn gate in executeTurn applies the pending
        // checkpoint before the drained turn runs. No-ops while running.
        if (!this.running) {
          this.kickDrain();
        }
      }
    });

    // Stdin router — split on \r?\n only. Node's readline.createInterface
    // also splits on U+2028/U+2029, which corrupts JSON commands containing
    // those characters in string values (a real failure mode when users paste
    // text from Apple Notes etc. that contains LINE SEPARATOR).
    process.stdin.setEncoding('utf-8');
    process.stdin.on('data', (chunk: string) => {
      this.stdinBuffer += chunk;
      let nlIdx;
      while ((nlIdx = this.stdinBuffer.indexOf('\n')) !== -1) {
        const endIdx =
          nlIdx > 0 && this.stdinBuffer[nlIdx - 1] === '\r' ? nlIdx - 1 : nlIdx;
        const line = this.stdinBuffer.slice(0, endIdx);
        this.stdinBuffer = this.stdinBuffer.slice(nlIdx + 1);
        if (line.length > 0) {
          void this.handleStdinLine(line);
        }
      }
    });
    process.stdin.on('end', () => {
      if (this.stdinBuffer.length > 0) {
        void this.handleStdinLine(this.stdinBuffer);
        this.stdinBuffer = '';
      }
      this.emit('stopping');
      this.emit('stopped');
      process.exit(0);
    });

    process.on('SIGTERM', this.shutdown);
    process.on('SIGINT', this.shutdown);

    this.emit('ready');
  }

  private shutdown = (): void => {
    this.emit('stopping');
    this.emit('stopped');
    process.exit(0);
  };

  //////////////////////////////////////////////////////////////////////////////
  // Wire protocol
  //////////////////////////////////////////////////////////////////////////////
  private emit(
    event: string,
    data?: Record<string, unknown>,
    requestId?: string,
  ): void {
    const payload: Record<string, unknown> = { event, ...data };
    if (requestId) {
      payload.requestId = requestId;
    }
    const line = JSON.stringify(payload) + '\n';
    // Diagnostic for the get_history pipeline issue — confirms bytes left
    // Remy. If this line fires but the frontend renders nothing, the loss is
    // downstream of stdout (controller, WebSocket, frontend handler).
    if (event === 'history') {
      log.info('Wrote history event to stdout', {
        requestId,
        bytes: line.length,
      });
    }
    process.stdout.write(line);
  }

  /** Emit a `completed` event and mark completedEmitted. Queue state is
   * surfaced separately via the `queue_changed` event, not on `completed`. */
  private emitCompleted(
    rid: string | undefined,
    data: Record<string, unknown>,
  ): void {
    this.emit('completed', { ...data }, rid);
    this.completedEmitted = true;
    this.lastCompleted = {
      success: data.success === true,
      ...(typeof data.error === 'string' && { error: data.error }),
    };
  }

  /** Outcome of the turn's primary `completed`, for stamping onto absorbed
   * requestIds' terminals. Falls back to failure if none was emitted. */
  private primaryOutcome(): { success: boolean; error?: string } {
    return this.lastCompleted ?? { success: false };
  }

  /** Dispatch a simple (non-streaming) command: call handler, emit response + completed. */
  private dispatchSimple(
    requestId: string | undefined,
    eventName: string | null,
    handler: () => Record<string, unknown>,
  ): void {
    try {
      const data = handler();
      if (eventName) {
        this.emit(eventName, data, requestId);
      }
      this.emit('completed', { success: true }, requestId);
    } catch (err: any) {
      this.emit('completed', { success: false, error: err.message }, requestId);
    }
  }

  //////////////////////////////////////////////////////////////////////////////
  // Stats + queue persistence
  //////////////////////////////////////////////////////////////////////////////

  /** Persist sessionStats + queue snapshot + passive pen to .remy-stats.json. */
  private persistStats(): void {
    this.sessionStats.updatedAt = Date.now();
    writeStats(this.sessionStats, this.queue.snapshot(), this.passivePen);
  }

  //////////////////////////////////////////////////////////////////////////////
  // Background completions (tool-block mutation; message delivery via queue)
  //////////////////////////////////////////////////////////////////////////////

  /** Apply queued tool block updates to state.messages. Safe to call any time. */
  private applyPendingBlockUpdates(): void {
    if (this.pendingBlockUpdates.length === 0) {
      return;
    }
    const updates = this.pendingBlockUpdates.splice(0);
    for (const update of updates) {
      for (const msg of this.state.messages) {
        if (!Array.isArray(msg.content)) {
          continue;
        }
        for (const block of msg.content) {
          if (block.type === 'tool' && block.id === update.toolCallId) {
            block.backgroundResult = update.result;
            block.completedAt = Date.now();
            if (update.subAgentMessages) {
              block.subAgentMessages = update.subAgentMessages;
            }
          }
        }
      }
    }
    // Persist so background completions survive crashes
    saveSession(this.state);
  }

  /**
   * Forced compaction gate. If lastContextSize exceeds the threshold, compact
   * before letting the upcoming turn run. Coalesces with any in-flight
   * compaction (e.g., one already started by /compact or a tool call). No
   * timeout — compaction takes as long as it takes.
   *
   * Lifecycle events (`compaction_started` / `compaction_complete`) and
   * stats updates are handled by the listener registered in start(); this
   * method only awaits the promise and applies the resulting summaries.
   *
   * On compaction failure we don't bail — the turn proceeds and surfaces any
   * downstream overflow through the existing "prompt is too long" path.
   */
  private async runForcedCompactionIfNeeded(
    requestId: string | undefined,
  ): Promise<void> {
    if (
      this.sessionStats.lastContextSize <= FORCED_COMPACTION_THRESHOLD_TOKENS
    ) {
      return;
    }
    log.info('Forced compaction gate triggered', {
      contextSize: this.sessionStats.lastContextSize,
      threshold: FORCED_COMPACTION_THRESHOLD_TOKENS,
      requestId,
    });
    try {
      await triggerCompaction(this.state, this.config, {
        blocking: true,
        requestId,
        model: this.opts.model,
        origin: 'gate',
      });
      applyPendingSummaries(this.state);
    } catch {
      // Listener already emitted compaction_complete with the error.
    }
  }

  private onBackgroundComplete = (
    toolCallId: string,
    name: string,
    result: string,
    subAgentMessages?: Message[],
  ): void => {
    // Delivery class comes from the tool definition. Unknown names (e.g. a
    // sub-agent reporting under a display name that isn't a registered tool)
    // default to 'wake' — the historical behavior.
    const notify = getToolByName(name)?.backgroundNotify ?? 'wake';

    // Queue the tool block mutation — applied when safe (not mid-turn)
    this.pendingBlockUpdates.push({ toolCallId, result, subAgentMessages });

    log.info('Background complete', {
      toolCallId,
      name,
      notify,
      requestId: this.currentRequestId,
    });

    // Emit event so frontend can update immediately
    this.onEvent({
      type: 'tool_background_complete',
      id: toolCallId,
      name,
      result,
    });

    if (notify === 'passive') {
      // Passive tools never wake the agent (success and failure alike): park
      // the result in the pen; it rides the next real turn as a hidden
      // background_results entry via the sweep in executeTurn.
      this.passivePen.push({ toolCallId, name, result });
      this.persistStats();
      if (!this.running) {
        this.applyPendingBlockUpdates();
      }
      return;
    }

    if (notify === 'silent') {
      // Silent tools update their tool block (for the UI detail view) and
      // nothing else — the model is never told, because the outcome reaches
      // it by another mechanism (compactConversation: the checkpoint itself).
      if (!this.running) {
        this.applyPendingBlockUpdates();
      }
      return;
    }

    // Queue the synthetic message for the LLM
    this.queue.push({
      command: {
        action: 'message',
        text: buildBackgroundResultsMessage([{ toolCallId, name, result }]),
        ...(this.currentOnboardingState && {
          onboardingState: this.currentOnboardingState,
        }),
      } as StdinCommand,
      source: 'background',
      enqueuedAt: Date.now(),
    });

    // If idle, drain immediately; otherwise it'll be picked up after the current turn
    if (!this.running) {
      this.applyPendingBlockUpdates();
      this.kickDrain();
    }
  };

  //////////////////////////////////////////////////////////////////////////////
  // External tool bridge
  //////////////////////////////////////////////////////////////////////////////

  private resolveExternalTool = (
    id: string,
    name: string,
    _input: Record<string, any>,
  ): Promise<string> => {
    const early = this.earlyResults.get(id);
    if (early !== undefined) {
      this.earlyResults.delete(id);
      return Promise.resolve(early);
    }

    const shouldTimeout = !USER_FACING_TOOLS.has(name);
    return new Promise<string>((resolve) => {
      const timeout = shouldTimeout
        ? setTimeout(() => {
            this.pendingTools.delete(id);
            resolve(
              'Error: Tool timed out — no response from the app environment after 5 minutes.',
            );
          }, EXTERNAL_TOOL_TIMEOUT_MS)
        : undefined;

      this.pendingTools.set(id, {
        resolve: (result: string) => {
          clearTimeout(timeout);
          resolve(result);
        },
        timeout,
      });
    });
  };

  //////////////////////////////////////////////////////////////////////////////
  // AgentEvent → wire protocol translation
  //////////////////////////////////////////////////////////////////////////////

  private onEvent = (e: AgentEvent): void => {
    const rid = this.currentRequestId;

    switch (e.type) {
      case 'turn_started':
        this.emit(
          'turn_started',
          {
            ...(e.model && { model: e.model }),
            ...(e.modelOverride && { modelOverride: e.modelOverride }),
          },
          rid,
        );
        return;
      case 'user_message':
        this.emit(
          'user_message',
          {
            text: e.text,
            // Forward attachments so queued voice/image/file sends render live;
            // otherwise the bubble is blank until a get_history refresh.
            ...(e.attachments && { attachments: e.attachments }),
            // Queue-delivered entries are flagged so the frontend renders the
            // echo (idle sends are rendered optimistically instead).
            ...(e.queued && { queued: true }),
            // Hidden entries (e.g. the passive background_results sweep) are
            // flagged so the sandbox/frontend suppress the bubble.
            ...(e.hidden && { hidden: true }),
          },
          // A merged turn emits one user_message per absorbed entry — each
          // carries its own original requestId, not the turn's.
          e.requestId ?? rid,
        );
        return;

      // Terminal events — translate to `completed`.
      // Post-turn queue drain happens in handleMessage AFTER runTurn returns,
      // so that `running` is held across the drain and no user message can
      // slip in mid-pipeline.
      case 'turn_done':
        // Accumulate session stats
        if (e.stats) {
          this.sessionStats.turns++;
          this.sessionStats.totalInputTokens += e.stats.inputTokens;
          this.sessionStats.totalOutputTokens += e.stats.outputTokens;
          this.sessionStats.totalCacheCreationTokens +=
            e.stats.cacheCreationTokens ?? 0;
          this.sessionStats.totalCacheReadTokens +=
            e.stats.cacheReadTokens ?? 0;
          this.sessionStats.lastContextSize =
            e.stats.lastCallInputTokens ?? e.stats.inputTokens;
        }
        this.sessionStats.messageCount = this.state.messages.length;
        this.persistStats();
        this.emitCompleted(rid, {
          success: true,
          durationMs: Date.now() - this.turnStart,
        });
        return;
      case 'turn_cancelled':
        // Cancel flushes this run's chain/background follow-ups (in
        // handleCancel) while preserving queued user messages, which run next.
        this.emitCompleted(rid, { success: false, error: 'cancelled' });
        return;

      // Streaming events — forward with requestId
      case 'text':
        this.emit(
          'text',
          {
            text: e.text,
            ...(e.parentToolId && { parentToolId: e.parentToolId }),
          },
          rid,
        );
        return;
      case 'thinking':
        this.emit(
          'thinking',
          {
            text: e.text,
            ...(e.parentToolId && { parentToolId: e.parentToolId }),
          },
          rid,
        );
        return;
      case 'tool_input_delta':
        this.emit(
          'tool_input_delta',
          {
            id: e.id,
            name: e.name,
            result: e.result,
            ...(e.parentToolId && { parentToolId: e.parentToolId }),
          },
          rid,
        );
        return;
      case 'tool_start':
        this.emit(
          'tool_start',
          {
            id: e.id,
            name: e.name,
            input: e.input,
            ...(e.partial && { partial: true }),
            ...(e.background && { background: true }),
            ...(e.parentToolId && { parentToolId: e.parentToolId }),
          },
          rid,
        );
        return;
      case 'tool_done':
        this.emit(
          'tool_done',
          {
            id: e.id,
            name: e.name,
            result: e.result,
            isError: e.isError,
            ...(e.parentToolId && { parentToolId: e.parentToolId }),
          },
          rid,
        );
        return;
      case 'tool_background_complete':
        this.emit(
          'tool_background_complete',
          {
            id: e.id,
            name: e.name,
            result: e.result,
            ...(e.parentToolId && { parentToolId: e.parentToolId }),
          },
          rid,
        );
        return;
      case 'tool_stopped':
        this.emit(
          'tool_stopped',
          {
            id: e.id,
            name: e.name,
            mode: e.mode,
            ...(e.parentToolId && { parentToolId: e.parentToolId }),
          },
          rid,
        );
        return;
      case 'tool_restarted':
        this.emit(
          'tool_restarted',
          {
            id: e.id,
            name: e.name,
            input: e.input,
            ...(e.parentToolId && { parentToolId: e.parentToolId }),
          },
          rid,
        );
        return;
      case 'status':
        this.emit(
          'status',
          {
            message: e.message,
            ...(e.parentToolId && { parentToolId: e.parentToolId }),
          },
          rid,
        );
        return;
      case 'error':
        this.emit(
          'error',
          { error: e.error, ...(e.code ? { code: e.code } : {}) },
          rid,
        );
        return;
    }
  };

  //////////////////////////////////////////////////////////////////////////////
  // Message command handler (long-running / streaming)
  //////////////////////////////////////////////////////////////////////////////

  /**
   * Persist one entry's non-voice uploads to disk and build its header. The
   * header tells the LLM where to read each file; it's kept separate so it
   * gets injected at API-send time and never persisted into the user's chat
   * content (which would leak into history restore on the frontend).
   *
   * Must be awaited sequentially across entries — persistAttachments'
   * filename de-dup set is per-call, so parallel calls race on names.
   */
  private async persistEntryAttachments(
    attachments: Attachment[] | undefined,
  ): Promise<string | undefined> {
    if (!attachments?.some((a) => !a.isVoice)) {
      return undefined;
    }
    try {
      const { documents, images } = await persistAttachments(attachments);
      return buildUploadHeader(documents, images) || undefined;
    } catch (err: any) {
      log.warn('Attachment persistence failed', { error: err.message });
      return undefined;
    }
  }

  /**
   * Run one turn for a single command (without acquiring the `running` lock).
   * Owns the per-command machinery: @@automated:: action resolution, plan-file
   * and buildModel side effects, and chain expansion — which is why
   * sentinel-bearing commands always come through here, one turn each, never
   * merged. The turn itself runs in executeTurn.
   */
  private async runSingleTurn(
    parsed: StdinCommand,
    requestId: string | undefined,
    fromChain = false,
    queued = false,
  ): Promise<void> {
    const attachments = parsed.attachments as Attachment[] | undefined;
    if (attachments?.length) {
      log.info('Message has attachments', {
        count: attachments.length,
        urls: attachments.map((a) => a.url),
      });
    }

    let userMessage = (parsed.text as string) ?? '';
    const attachmentHeader = await this.persistEntryAttachments(attachments);

    // Resolve @@automated:: actions — loads prompt, interpolates params
    let resolved: ReturnType<typeof resolveAction> = null;
    try {
      resolved = resolveAction(userMessage);
    } catch (err: any) {
      this.emitCompleted(requestId, {
        success: false,
        error: err.message || 'Failed to resolve action',
      });
      return;
    }
    if (resolved !== null) {
      userMessage = resolved.message;
    }
    const isHidden = !!(parsed.hidden as boolean);

    // Update .remy-plan.md before building the system prompt so the
    // injected <pending_plan>/<approved_plan> note reflects the new state.
    const rawText = (parsed.text as string) ?? '';
    applyPlanFileSideEffect(rawText);
    // A per-build model override rides on the approve message only; gate it to
    // the approvePlan sentinel so it applies to the single build turn (see
    // runTurn) and never leaks onto unrelated messages.
    const buildModel = hasSentinel(rawText, 'approvePlan')
      ? (parsed.buildModel as string | undefined)
      : undefined;

    const onboardingState =
      (parsed.onboardingState as string) ?? 'onboardingFinished';
    this.currentOnboardingState = onboardingState;
    const system = buildSystemPrompt(
      onboardingState,
      parsed.viewContext as any,
    );

    // Pre-enqueue the whole chain at the head so the full pipeline is visible
    // up front and user messages queue behind it. Only the head expands the
    // chain; continuation steps (fromChain) skip this to avoid double-enqueueing
    // — and double-running — steps the head already laid down. onboardingState
    // is snapshotted onto each queued command so it travels with the chain.
    if (resolved?.next && !fromChain) {
      for (const step of getActionChain(resolved.next)) {
        this.queue.push({
          command: {
            action: 'message',
            text: sentinel(step),
            onboardingState,
          } as StdinCommand,
          source: 'chain',
          enqueuedAt: Date.now(),
        });
      }
    }

    await this.executeTurn({
      entries: [
        {
          text: userMessage,
          attachments,
          attachmentHeader,
          hidden: isHidden || undefined,
          requestId,
          queued: queued || undefined,
        },
      ],
      requestId,
      absorbedRids: [],
      onboardingState,
      system,
      buildModel,
    });
  }

  /**
   * Run a mailbox batch — contiguous queued user + background items — as one
   * merged turn. Every item becomes its own history entry and user_message
   * event (own requestId, attachments, hidden flag); adjacent background
   * items fold into a single background_results entry so the LLM sees one
   * combined block. No action-sentinel machinery here: batch construction
   * guarantees none (sentinel-bearing user items are drain barriers that run
   * alone via runSingleTurn, and background_results is a NON_ACTION sentinel
   * with no side effects).
   */
  private async runMergedTurn(batch: QueuedMessage[]): Promise<void> {
    const primaryRid =
      (batch[0].command.requestId as string | undefined) ??
      (batch.every((b) => b.source === 'background')
        ? `background-${Date.now()}`
        : `merged-${Date.now()}`);
    const absorbedRids = batch
      .slice(1)
      .map((b) => b.command.requestId as string | undefined)
      .filter((rid): rid is string => typeof rid === 'string');

    const entryList: Array<{ entry: TurnEntry; background: boolean }> = [];
    for (const item of batch) {
      const text = (item.command.text as string) ?? '';
      const prev = entryList[entryList.length - 1];
      if (item.source === 'background' && prev?.background) {
        prev.entry.text = mergeBackgroundResultsMessages([
          prev.entry.text,
          text,
        ]);
        continue;
      }
      entryList.push({
        background: item.source === 'background',
        entry: {
          text,
          attachments: item.command.attachments as Attachment[] | undefined,
          hidden: !!item.command.hidden || undefined,
          // Background items carry no requestId — their user_message falls
          // back to the turn's primary rid on the wire.
          requestId: item.command.requestId as string | undefined,
          queued: true,
        },
      });
    }
    const entries = entryList.map((e) => e.entry);

    // Sequential on purpose — see persistEntryAttachments.
    for (const entry of entries) {
      entry.attachmentHeader = await this.persistEntryAttachments(
        entry.attachments,
      );
    }

    // The batch shares one system prompt: onboardingState is uniform across
    // the batch by construction (drain barrier), viewContext is the user's
    // latest editor location.
    const onboardingState =
      (batch.find((b) => b.command.onboardingState !== undefined)?.command
        .onboardingState as string | undefined) ??
      this.currentOnboardingState ??
      'onboardingFinished';
    this.currentOnboardingState = onboardingState;
    const viewContext = [...batch]
      .reverse()
      .find((b) => b.command.viewContext !== undefined)?.command.viewContext;

    await this.executeTurn({
      entries,
      requestId: primaryRid,
      absorbedRids,
      onboardingState,
      system: buildSystemPrompt(onboardingState, viewContext as any),
    });
  }

  /**
   * Run one agent turn over the given entries (without acquiring the
   * `running` lock). Owns the turn-generic lifecycle: request bookkeeping,
   * the forced-compaction gate, runTurn error handling, and terminal
   * `completed` events — the primary requestId's completed first, then one
   * `{absorbed: true}` completed per other absorbed requestId with the same
   * outcome, on every exit path (done, cancel, error, unexpected), so every
   * queued message's caller resolves.
   */
  private async executeTurn(params: {
    entries: TurnEntry[];
    requestId: string | undefined;
    absorbedRids: string[];
    onboardingState: string;
    system: string;
    buildModel?: string;
  }): Promise<void> {
    const { entries, requestId, absorbedRids, onboardingState, system } =
      params;
    this.currentRequestId = requestId;
    this.currentAbort = new AbortController();
    this.completedEmitted = false;
    this.lastCompleted = null;
    this.turnStart = Date.now();

    // Compaction gate: every turn waits for an in-flight compaction and runs
    // against the compacted history — otherwise the whole turn (every tool
    // round-trip) bills at full context while the finished checkpoint sits
    // unapplied. A failed compaction must not block the turn, hence the
    // swallowed rejection. A cancel during the wait is honored by runTurn's
    // first aborted check (currentAbort already exists). Placed BEFORE the
    // passive-pen sweep so pen results landing during the wait ride this turn.
    const inflight = getInflightCompaction();
    if (inflight) {
      await inflight.catch(() => {});
    }
    applyPendingSummaries(this.state);

    // Sweep the passive pen into this turn. executeTurn is the single choke
    // point every turn shape passes through (idle sends and chain steps via
    // runSingleTurn, mailbox batches via runMergedTurn), downstream of all
    // sentinel side-effect machinery — and background_results is a NON_ACTION
    // sentinel, so the entry is side-effect-free in any turn type. Prepended
    // (results chronologically precede the triggering message) and hidden
    // (no transcript bubble — the tool block already shows the completion).
    if (this.passivePen.length > 0) {
      const swept = this.passivePen.splice(0);
      this.persistStats();
      entries.unshift({
        text: buildBackgroundResultsMessage(swept),
        hidden: true,
      });
    }

    // Pull hook for ASAP-promoted queued messages, called by runTurn at each
    // tool boundary. Supplied on every turn — including chain build steps —
    // so "as soon as possible" means the next stopping point of whatever is
    // running. Pulls ALL currently-eligible items in FIFO order, deliberately
    // jumping any chain steps queued ahead of them (that is the point of
    // promotion — the one place queue FIFO is intentionally violated). The
    // items' own onboardingState/viewContext are ignored: the running turn's
    // system prompt is already built. Consumed requestIds are collected for
    // absorbed terminals below; if the turn ends before a pull, unconsumed
    // items simply stay queued and drain post-turn in normal FIFO order.
    const consumedRids: string[] = [];
    const takeSteering = async (): Promise<TurnEntry[]> => {
      const items = this.queue.removeWhere(
        (it) =>
          it.source === 'user' &&
          it.delivery === 'asap' &&
          !this.isDrainBarrier(it),
      );
      const steered: TurnEntry[] = [];
      // Sequential on purpose — see persistEntryAttachments.
      for (const it of items) {
        const attachments = it.command.attachments as Attachment[] | undefined;
        const attachmentHeader =
          await this.persistEntryAttachments(attachments);
        const rid = it.command.requestId as string | undefined;
        if (rid) {
          consumedRids.push(rid);
        }
        steered.push({
          text: (it.command.text as string) ?? '',
          attachments,
          attachmentHeader,
          requestId: rid,
          queued: true,
        });
      }
      return steered;
    };

    // Forced compaction gate: if the conversation is approaching the API cap,
    // compact before processing this turn. Coalesces with any in-flight
    // compaction. No timeout — compaction takes as long as it takes.
    await this.runForcedCompactionIfNeeded(requestId);

    try {
      await runTurn({
        state: this.state,
        entries,
        apiConfig: this.config,
        system,
        model: this.opts.model,
        buildModel: params.buildModel,
        onboardingState,
        requestId,
        signal: this.currentAbort.signal,
        onEvent: this.onEvent,
        takeSteering,
        resolveExternalTool: this.resolveExternalTool,
        toolRegistry: this.toolRegistry,
        onBackgroundComplete: this.onBackgroundComplete,
      });
      // runTurn may have emitted turn_done or turn_cancelled (→ completed).
      // If it returned without either (e.g. streaming error early-return),
      // we need to emit the terminal event ourselves.
      if (!this.completedEmitted) {
        this.emitCompleted(requestId, {
          success: false,
          error: 'Turn ended unexpectedly',
        });
      }
      log.info('Turn complete', {
        requestId,
        durationMs: Date.now() - this.turnStart,
      });
    } catch (err: any) {
      if (!this.completedEmitted) {
        this.emit('error', { error: err.message }, requestId);
        this.emitCompleted(requestId, {
          success: false,
          error: err.message,
        });
      }
      log.warn('Command failed', {
        action: 'message',
        requestId,
        error: err.message,
      });
      // Leave the queue intact — transient errors like network termination
      // shouldn't silently throw away the rest of the pipeline; the sandbox
      // can offer a resume action. Items already absorbed into THIS turn were
      // delivered, not re-queued — their outcome is reported per-requestId by
      // the absorbed completeds below. Explicit user cancel is what drains
      // the queue.
    }

    // Terminal events for the other messages absorbed into this turn: merged
    // mailbox entries (absorbedRids) and ASAP messages injected mid-turn
    // (consumedRids). Emitted via raw emit (not emitCompleted) so they don't
    // disturb the primary's completedEmitted/lastCompleted bookkeeping.
    const outcome = this.primaryOutcome();
    for (const rid of [...absorbedRids, ...consumedRids]) {
      this.emit(
        'completed',
        {
          success: outcome.success,
          ...(outcome.error && { error: outcome.error }),
          absorbed: true,
        },
        rid,
      );
    }

    // Apply queued mutations — happens on both success and cancel paths
    applyPendingSummaries(this.state);
    this.applyPendingBlockUpdates();
  }

  private async handleMessage(
    parsed: StdinCommand,
    requestId: string | undefined,
  ): Promise<void> {
    // If a turn OR a compaction is in flight, queue the user message instead
    // of rejecting. Compaction counts as busy on purpose: running the turn
    // immediately would bill it at full uncompacted context (the pre-turn
    // gate in executeTurn would make it wait anyway), and queueing renders it
    // in the frontend's Queued Messages card with its normal affordances.
    if (this.running || getInflightCompaction()) {
      // Mirror the requestId onto the stored command so it's used when drained.
      const command: StdinCommand = { ...parsed };
      if (requestId && command.requestId === undefined) {
        command.requestId = requestId;
      }
      this.queue.push({
        command,
        source: 'user',
        enqueuedAt: Date.now(),
      });
      // The push fires `queue_changed`; the message's eventual `completed`
      // (when it drains and runs) is its terminal. If the compaction finished
      // between the check above and the push, the listener's kickDrain
      // already ran against an empty queue — re-kick so this item isn't
      // stranded until the next wake.
      if (!this.running && !getInflightCompaction()) {
        this.kickDrain();
      }
      return;
    }

    this.running = true;
    try {
      // Run the initial command
      await this.runSingleTurn(parsed, requestId);
      // Then drain whatever got queued (chain next, background results,
      // or user messages sent during the turn).
      await this.drainQueueLoop();
    } finally {
      // Abort before dropping the controller: anything still holding this
      // turn's signal (e.g. a status poller that escaped its own teardown)
      // dies with the turn instead of running for the process's lifetime.
      this.currentAbort?.abort();
      this.currentAbort = null;
      this.currentRequestId = undefined;
      this.running = false;
    }
  }

  /**
   * True for queued user items whose text is an @@automated:: action message.
   * These key per-item raw-text side effects in runSingleTurn (resolveAction,
   * plan file, buildModel, chain expansion) — they always run alone, one turn
   * each. Background items are sentinel-formatted too but background_results
   * is NON_ACTION and side-effect-free, so they merge freely.
   */
  private isDrainBarrier(item: QueuedMessage): boolean {
    return (
      item.source === 'user' &&
      isAutomatedMessage((item.command.text as string) ?? '')
    );
  }

  /**
   * Drain the queue in strict FIFO order. Caller must hold `running = true`.
   * User messages arriving during the drain will be enqueued behind current items.
   *
   * The queue serves two purposes with opposite delivery semantics:
   * - Sequencer: chain steps and sentinel-bearing user items are pipeline
   *   stages — one item, one turn, nothing merged in.
   * - Mailbox: plain user messages and background results are accumulated
   *   context and intent — everything contiguous flushes together into ONE
   *   merged turn, so the model reconciles all of it at once instead of
   *   burning a full turn per item (and possibly executing instructions a
   *   later queued message already amended).
   */
  private async drainQueueLoop(): Promise<void> {
    while (this.queue.length > 0) {
      const head = this.queue.peek()!;

      if (head.source === 'chain') {
        const item = this.queue.shift()!;
        const rid =
          (item.command.requestId as string | undefined) ??
          `chain-${Date.now()}`;
        await this.runSingleTurn(item.command, rid, true);
        continue;
      }

      if (this.isDrainBarrier(head)) {
        const item = this.queue.shift()!;
        const rid =
          (item.command.requestId as string | undefined) ??
          `user-${Date.now()}`;
        await this.runSingleTurn(item.command, rid, false, true);
        continue;
      }

      // Mailbox batch: contiguous user+background items, stopping at a chain
      // step, a sentinel barrier, or a conflicting onboardingState (it selects
      // the turn's toolset, so items from different phases can't share one).
      let n = 1;
      let batchOb = head.command.onboardingState as string | undefined;
      for (; ; n++) {
        const it = this.queue.peekAt(n);
        if (!it || it.source === 'chain' || this.isDrainBarrier(it)) {
          break;
        }
        const ob = it.command.onboardingState as string | undefined;
        if (ob !== undefined && batchOb !== undefined && ob !== batchOb) {
          break;
        }
        if (ob !== undefined && batchOb === undefined) {
          batchOb = ob;
        }
      }
      const batch = this.queue.shiftMany(n); // one queue_changed for the batch
      await this.runMergedTurn(batch);
    }
  }

  /**
   * Resume draining the queue when the agent is idle. Acquires the lock,
   * drains, releases. Used by the `resume` stdin action (sandbox-initiated)
   * and by kickDrain (background-completion-initiated).
   */
  private async resumeQueue(): Promise<void> {
    if (this.running || this.queue.length === 0) {
      return;
    }
    this.running = true;
    try {
      await this.drainQueueLoop();
    } finally {
      // Abort before dropping the controller: anything still holding this
      // turn's signal (e.g. a status poller that escaped its own teardown)
      // dies with the turn instead of running for the process's lifetime.
      this.currentAbort?.abort();
      this.currentAbort = null;
      this.currentRequestId = undefined;
      this.running = false;
    }
  }

  /**
   * Kick off drainage of the queue when the agent is idle. Used by
   * onBackgroundComplete (when !running) to deliver results without
   * racing any currently-synchronous path.
   */
  private kickDrain(): void {
    if (this.running || this.queue.length === 0) {
      return;
    }
    // Schedule to avoid re-entrancy with the caller's synchronous path
    setTimeout(() => this.resumeQueue(), 0);
  }

  //////////////////////////////////////////////////////////////////////////////
  // Simple command handlers
  //////////////////////////////////////////////////////////////////////////////

  private handleClear(): Record<string, unknown> {
    clearSession(this.state);
    return {};
  }

  /** Change per-agent model picks without clearing history. Takes effect on
   * the next turn — the model is resolved live, per LLM call, from
   * `state.models`. Omitting `models` (or sending an empty object) resets
   * every agent to "use server defaults". */
  private handleChangeModels(
    models: Record<string, string> | undefined,
  ): Record<string, unknown> {
    this.state.models =
      models && Object.keys(models).length > 0 ? models : undefined;
    saveSession(this.state);
    return {
      ...(this.state.models && { models: this.state.models }),
      modelSurfaces: getEffectiveModelSurfaces(),
      allowedModelsByType: ALLOWED_MODELS_BY_TYPE,
    };
  }

  /**
   * Cancel the running turn and flush the follow-ups that belonged to it
   * (`chain`/`background`), while preserving `source: 'user'` items — those are
   * independent user intent, not tied to the aborted run. The preserved user
   * messages run next: `executeTurn` swallows the abort, so `handleMessage`
   * falls through to `drainQueueLoop` with `running` still held. Returns the
   * flushed items (for the cancel command's resume/discard UX).
   *
   * Messages already absorbed into the in-flight merged turn are NOT
   * preserved — they were delivered into the turn that's being cancelled and
   * each gets a `{cancelled, absorbed:true}` terminal. Only items still
   * sitting in the queue survive.
   */
  private handleCancel(): QueuedMessage[] {
    if (this.currentAbort) {
      this.currentAbort.abort();
    }
    for (const [id, pending] of this.pendingTools) {
      clearTimeout(pending.timeout);
      pending.resolve(USER_CANCELLED_RESULT);
      this.pendingTools.delete(id);
    }
    return this.queue.removeWhere((item) => item.source !== 'user');
  }

  /**
   * Remove pending queued messages — all user messages, or one by id.
   * Only `source: 'user'` items are removable; chained and background
   * messages are part of a system chain and are never cancellable. Does
   * not affect the in-flight turn (use `cancel` for that).
   */
  private handleCancelQueued(id?: string): QueuedMessage[] {
    return this.queue.removeWhere(
      (item) =>
        item.source === 'user' &&
        (id === undefined || item.command.requestId === id),
    );
  }

  //////////////////////////////////////////////////////////////////////////////
  // Stdin router
  //////////////////////////////////////////////////////////////////////////////

  private handleStdinLine = async (line: string): Promise<void> => {
    let parsed: StdinCommand;
    try {
      parsed = JSON.parse(line);
    } catch (err: any) {
      // Surface to logs as well as the frontend so silent IPC corruption
      // (e.g. line splitter chopping a command in half) leaves a fingerprint.
      log.warn('Invalid JSON on stdin', {
        error: err.message,
        lineLength: line.length,
        preview: line.slice(0, 200),
      });
      this.emit('error', { error: 'Invalid JSON on stdin' });
      return;
    }

    const { action, requestId } = parsed;
    log.info('Command received', { action, requestId });

    // tool_result: fire-and-forget, resolves a pending external tool promise
    if (action === 'tool_result' && parsed.id) {
      const id = parsed.id as string;
      const result = (parsed.result as string) ?? '';
      const pending = this.pendingTools.get(id);
      if (pending) {
        this.pendingTools.delete(id);
        pending.resolve(result);
      } else if (!this.running) {
        // No pending tool and no active turn — likely a late result after
        // restart (session sanitization already patched the conversation).
        // Emit completed so the frontend dismisses any stale overlay.
        log.info('Late tool_result while idle, dismissing', { id });
        this.emit('completed', { success: true }, requestId);
      } else {
        this.earlyResults.set(id, result);
      }
      return;
    }

    if (action === 'get_history') {
      // Flush any queued tool-block updates so history is up-to-date
      // (background completions are deferred while a turn is in progress,
      // but callers — e.g., sandbox init frame — need the latest state).
      this.applyPendingBlockUpdates();

      // Paginated over a GLOBAL index space that spans the sealed session
      // archives followed by the live tail — so scrollback continues past a
      // rotation to the conversation start, not just to the start of the live
      // (post-rotation) array. `before` is an exclusive upper bound (default =
      // end, i.e. most recent). getHistoryPage owns the clamp, boundary walk,
      // and archive reads; state.messages is never mutated. (See session.ts.)
      const page = getHistoryPage(this.state, {
        ...(typeof parsed.before === 'number' ? { before: parsed.before } : {}),
        ...(typeof parsed.limit === 'number' ? { limit: parsed.limit } : {}),
      });

      log.info('History response', {
        requestId,
        startIndex: page.startIndex,
        endIndex: page.endIndex,
        count: page.endIndex - page.startIndex,
        totalMessageCount: page.totalMessageCount,
        beforeParam: parsed.before,
        limitParam: parsed.limit,
      });

      this.dispatchSimple(requestId, 'history', () => ({
        messages: page.messages,
        startIndex: page.startIndex,
        endIndex: page.endIndex,
        totalMessageCount: page.totalMessageCount,
        running: this.running,
        ...(this.running && this.currentRequestId
          ? { currentRequestId: this.currentRequestId }
          : {}),
        ...(this.state.models && { models: this.state.models }),
        modelSurfaces: getEffectiveModelSurfaces(),
        allowedModelsByType: ALLOWED_MODELS_BY_TYPE,
        // Current queue snapshot for connect/reconnect — get_history is the
        // on-demand "current state" query. Always an array (possibly empty),
        // matching the queue_changed convention so the client reconciles the
        // same way from both; live mutations are pushed via queue_changed.
        queuedMessages: this.queue.snapshot(),
      }));
      return;
    }

    if (action === 'clear') {
      // Reset the transient activity label before clearing. The status watcher
      // is skipped on the first message of a fresh session (see isFirstMessage
      // in agent.ts), so without this the just-cleared conversation's last
      // status line lingers and reappears as the "reasoning" of the next
      // question — looking like the old chat leaked into context when it hasn't.
      this.emit('status', { message: '' });
      this.dispatchSimple(requestId, 'session_cleared', () =>
        this.handleClear(),
      );
      return;
    }

    if (action === 'changeModels') {
      // Mutating state.models mid-turn would swap models within a single
      // in-flight reasoning/tool chain — reject while running (mirrors the
      // `resume` guard). The model is resolved live per call, so the new
      // picks take effect on the next turn.
      if (this.running) {
        this.emit(
          'completed',
          {
            success: false,
            error: 'cannot change models while a turn is running',
          },
          requestId,
        );
        return;
      }
      const models = parsed.models as Record<string, string> | undefined;
      this.dispatchSimple(requestId, 'models_changed', () =>
        this.handleChangeModels(models),
      );
      return;
    }

    if (action === 'cancel') {
      const cancelled = this.handleCancel();
      // The in-flight message's completed(success:false, error:"cancelled")
      // is handled by onEvent when turn_cancelled fires. The cancel's own
      // completed reports the flushed chain/background follow-ups (not the
      // preserved user messages, which run next) so the sandbox can offer resume.
      this.emit(
        'completed',
        {
          success: true,
          ...(cancelled.length > 0 && { cancelledMessages: cancelled }),
        },
        requestId,
      );
      return;
    }

    if (action === 'cancelQueued') {
      // Cancel pending queued messages without touching the in-flight turn.
      // Only user messages are cancellable; chain/background are protected.
      const id = parsed.id as string | undefined;
      const removed = this.handleCancelQueued(id);
      this.emit(
        'completed',
        { success: true, cancelledQueued: removed },
        requestId,
      );
      return;
    }

    if (action === 'setQueuedDelivery') {
      // Promote a queued user message to ASAP (mid-turn injection at the next
      // tool boundary) or demote it back to after-turn. Only plain user
      // messages qualify — @@automated:: items carry per-turn side effects
      // and must run alone (see isDrainBarrier); chain/background items are
      // remy's own pipeline. A miss also covers the promote/consume race
      // (the item was already injected); the frontend reconciles from
      // queue_changed either way.
      const id = parsed.id as string | undefined;
      const delivery = parsed.delivery as string | undefined;
      if (!id || (delivery !== 'asap' && delivery !== 'afterTurn')) {
        this.emit(
          'completed',
          {
            success: false,
            error:
              'setQueuedDelivery requires id and delivery ("asap" | "afterTurn")',
          },
          requestId,
        );
        return;
      }
      const target = this.queue
        .snapshot()
        .find((it) => it.command.requestId === id);
      if (!target || target.source !== 'user' || this.isDrainBarrier(target)) {
        this.emit(
          'completed',
          { success: false, error: 'message not found or not promotable' },
          requestId,
        );
        return;
      }
      this.queue.setDelivery(id, delivery);
      this.emit('completed', { success: true }, requestId);
      return;
    }

    if (action === 'stop_tool') {
      const id = parsed.id as string;
      const mode = ((parsed.mode as string) ?? 'hard') as 'graceful' | 'hard';
      const found = this.toolRegistry.stop(id, mode);
      if (found) {
        this.emit('completed', { success: true }, requestId);
      } else {
        this.emit(
          'completed',
          { success: false, error: 'Tool not found' },
          requestId,
        );
      }
      return;
    }

    if (action === 'restart_tool') {
      const id = parsed.id as string;
      const patchedInput = parsed.input as Record<string, any> | undefined;
      const found = this.toolRegistry.restart(id, patchedInput);
      if (found) {
        this.emit('completed', { success: true }, requestId);
      } else {
        this.emit(
          'completed',
          { success: false, error: 'Tool not found' },
          requestId,
        );
      }
      return;
    }

    if (action === 'compact') {
      // Lifecycle events + stats are handled by the registered listener;
      // here we only await the promise, apply summaries when it's safe, and
      // emit `completed` for the /compact command itself.
      try {
        await triggerCompaction(this.state, this.config, {
          blocking: false,
          requestId,
          model: this.opts.model,
          origin: 'user',
        });
        if (!this.running) {
          applyPendingSummaries(this.state);
        }
        this.emit('completed', { success: true }, requestId);
      } catch (err: any) {
        const error = err.message || 'Compaction failed';
        this.emit('completed', { success: false, error }, requestId);
      }
      return;
    }

    if (action === 'message') {
      await this.handleMessage(parsed, requestId);
      return;
    }

    if (action === 'resume') {
      // Drain any queued work. Used after restart to resume a chain that
      // was persisted to disk, without double-executing (as would happen
      // if the sandbox re-sent queuedMessages[0] as a regular message).
      if (this.running) {
        this.emit(
          'completed',
          { success: false, error: 'already running' },
          requestId,
        );
        return;
      }
      if (this.queue.length === 0) {
        this.emit('completed', { success: true }, requestId);
        return;
      }
      // Acknowledge the resume command immediately; the queued turns fire
      // with their own requestIds and completed events.
      this.emit('completed', { success: true }, requestId);
      await this.resumeQueue();
      return;
    }

    // Unknown action
    this.emit('error', { error: `Unknown action: ${action}` }, requestId);
    this.emit(
      'completed',
      { success: false, error: `Unknown action: ${action}` },
      requestId,
    );
  };
}
