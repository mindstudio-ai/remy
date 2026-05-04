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
 * - `tool_result` is fire-and-forget (resolves an in-flight promise, no completed event).
 *
 * `get_history` is paginated. Request: {action:"get_history", before?:number,
 * limit?:number, requestId}. `before` is an exclusive upper bound on message
 * index (defaults to end of array — the most recent messages); `limit` caps
 * page size (default 500, hard cap 2000). Response: {event:"history",
 * messages, startIndex, endIndex, totalMessageCount, ...}. Walk backward by
 * passing the previous response's `startIndex` as the next `before`. When
 * `startIndex === 0`, no older messages remain.
 */

import { createLogger } from '../logger.js';
import type { Attachment, Message } from '../api.js';
import { resolveConfig } from '../config.js';
import { buildSystemPrompt } from '../prompt/index.js';
import {
  triggerCompaction,
  getPendingSummaries,
  setCompactionListener,
} from '../compaction/trigger.js';
import { findSafeInsertionPoint } from '../compaction/index.js';
import { triggerBrandExtraction } from '../brandExtraction/trigger.js';
import { setLspBaseUrl } from '../tools/_helpers/lsp.js';
import {
  createAgentState,
  runTurn,
  type AgentState,
  type AgentEvent,
} from '../agent.js';
import { loadSession, clearSession, saveSession } from '../session.js';
import type { StdinCommand } from '../types.js';
import { ToolRegistry } from '../toolRegistry.js';
import { persistAttachments, buildUploadHeader } from './attachments.js';
import { applyPlanFileSideEffect } from './planFile.js';
import {
  createSessionStats,
  loadQueue,
  writeStats,
  type SessionStats,
} from './stats.js';
import { MessageQueue, type QueuedMessage } from './messageQueue.js';
import { resolveAction } from '../automatedActions/resolve.js';
import {
  sentinel,
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

/** Default and hard-cap page sizes for the paginated `get_history` action. */
const HISTORY_DEFAULT_LIMIT = 500;
const HISTORY_MAX_LIMIT = 2000;

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

  /** Guard: track whether terminal `completed` was already sent so we emit exactly one. */
  private completedEmitted = false;
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

  // External tool bridge
  private pendingTools = new Map<string, PendingTool>();
  private earlyResults = new Map<string, string>();

  // Tool block updates from background completions (separate from the message queue)
  private pendingBlockUpdates: BlockUpdate[] = [];

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

    const resumed = loadSession(this.state);

    // Rehydrate the queue from disk — persisted on every change
    this.queue = new MessageQueue(loadQueue(), () => this.persistStats());

    if (resumed) {
      this.emit('session_restored', {
        messageCount: this.state.messages.length,
        ...this.queueFields(),
      });
    }

    // Cold-start brand extraction. The hash check inside the trigger makes
    // this a no-op when `.remy-brand.json` is already up to date; it covers
    // (a) projects loaded with brand spec but no extracted JSON yet, and
    // (b) spec files edited outside the agent (IDE) since last session.
    triggerBrandExtraction(this.config);

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
      } else {
        const data = event.error ? { error: event.error } : {};
        this.emit('compaction_complete', data, event.requestId);
        this.sessionStats.compactionInProgress = false;
        this.sessionStats.lastContextSize = 0;
        this.sessionStats.messageCount = this.state.messages.length;
        this.persistStats();
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

    this.emit('ready', this.queueFields());
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
    process.stdout.write(JSON.stringify(payload) + '\n');
  }

  /**
   * Emit a `completed` event and mark completedEmitted. Includes
   * `queuedMessages` if the queue has items (sandbox uses this to know the
   * agent is still busy with pipeline work).
   */
  private emitCompleted(
    rid: string | undefined,
    data: Record<string, unknown>,
  ): void {
    this.emit('completed', { ...data, ...this.queueFields() }, rid);
    this.completedEmitted = true;
  }

  /** Returns `{ queuedMessages }` when the queue is non-empty, else empty object. */
  private queueFields(): Record<string, unknown> {
    return this.queue.length > 0
      ? { queuedMessages: this.queue.snapshot() }
      : {};
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

  /** Persist sessionStats + queue snapshot to .remy-stats.json. */
  private persistStats(): void {
    this.sessionStats.updatedAt = Date.now();
    writeStats(this.sessionStats, this.queue.snapshot());
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
      });
      this.applyPendingSummaries();
    } catch {
      // Listener already emitted compaction_complete with the error.
    }
  }

  /** Drain pending compaction summaries and insert at a safe point. */
  private applyPendingSummaries(): void {
    const summaries = getPendingSummaries();
    if (summaries.length === 0) {
      return;
    }
    const idx = findSafeInsertionPoint(this.state.messages);
    this.state.messages.splice(idx, 0, ...summaries);
    saveSession(this.state);
  }

  private onBackgroundComplete = (
    toolCallId: string,
    name: string,
    result: string,
    subAgentMessages?: Message[],
  ): void => {
    // Queue the tool block mutation — applied when safe (not mid-turn)
    this.pendingBlockUpdates.push({ toolCallId, result, subAgentMessages });

    log.info('Background complete', {
      toolCallId,
      name,
      requestId: this.currentRequestId,
    });

    // Emit event so frontend can update immediately
    this.onEvent({
      type: 'tool_background_complete',
      id: toolCallId,
      name,
      result,
    });

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
        this.emit('turn_started', {}, rid);
        return;
      case 'user_message':
        this.emit('user_message', { text: e.text }, rid);
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
      case 'turn_cancelled': {
        // Cancel drains the queue (pipeline interrupted) — surfaced on the
        // cancel command's completed event for resume/discard UX.
        this.emit(
          'completed',
          { success: false, error: 'cancelled', ...this.queueFields() },
          rid,
        );
        this.completedEmitted = true;
        return;
      }

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
        this.emit('error', { error: e.error }, rid);
        return;
    }
  };

  //////////////////////////////////////////////////////////////////////////////
  // Message command handler (long-running / streaming)
  //////////////////////////////////////////////////////////////////////////////

  /**
   * Run one turn (without acquiring the `running` lock). Called by
   * handleMessage for the initial turn, then repeatedly for each queued
   * message — `running` stays held across the queue drain so no user
   * message can slip in mid-pipeline.
   */
  private async runSingleTurn(
    parsed: StdinCommand,
    requestId: string | undefined,
  ): Promise<void> {
    this.currentRequestId = requestId;
    this.currentAbort = new AbortController();
    this.completedEmitted = false;
    this.turnStart = Date.now();

    // Forced compaction gate: if the conversation is approaching the API cap,
    // compact before processing this turn. Coalesces with any in-flight
    // compaction. No timeout — compaction takes as long as it takes.
    await this.runForcedCompactionIfNeeded(requestId);

    const attachments = parsed.attachments as Attachment[] | undefined;
    if (attachments?.length) {
      log.info('Message has attachments', {
        count: attachments.length,
        urls: attachments.map((a) => a.url),
      });
    }

    // Persist file uploads to disk (skip voice messages). The header tells
    // the LLM where to read each file from disk; it's passed separately so it
    // gets injected at API-send time and never persisted into the user's
    // chat content (which would leak into history restore on the frontend).
    let userMessage = (parsed.text as string) ?? '';
    let attachmentHeader: string | undefined;
    if (attachments?.some((a) => !a.isVoice)) {
      try {
        const { documents, images } = await persistAttachments(attachments);
        const all = [...documents, ...images];
        const header = buildUploadHeader(all);
        if (header) {
          attachmentHeader = header;
        }
      } catch (err: any) {
        log.warn('Attachment persistence failed', { error: err.message });
      }
    }

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
    applyPlanFileSideEffect((parsed.text as string) ?? '');

    const onboardingState =
      (parsed.onboardingState as string) ?? 'onboardingFinished';
    this.currentOnboardingState = onboardingState;
    const system = buildSystemPrompt(
      onboardingState,
      parsed.viewContext as any,
    );

    // If this resolved action has a `next`, enqueue it now so it runs after
    // this turn completes. Snapshot the current onboardingState into the
    // queued command so it travels with the chain.
    if (resolved?.next) {
      this.queue.push({
        command: {
          action: 'message',
          text: sentinel(resolved.next),
          onboardingState,
        } as StdinCommand,
        source: 'chain',
        enqueuedAt: Date.now(),
      });
    }

    try {
      await runTurn({
        state: this.state,
        userMessage,
        attachments,
        attachmentHeader,
        apiConfig: this.config,
        system,
        model: this.opts.model,
        onboardingState,
        requestId,
        signal: this.currentAbort.signal,
        onEvent: this.onEvent,
        resolveExternalTool: this.resolveExternalTool,
        hidden: isHidden,
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
      // Leave the queue intact. emitCompleted surfaced it via queuedMessages
      // so the sandbox can offer a resume action — transient errors like
      // network termination shouldn't silently throw away the rest of the
      // pipeline. Explicit user cancel is what drains the queue.
    }

    // Apply queued mutations — happens on both success and cancel paths
    this.applyPendingSummaries();
    this.applyPendingBlockUpdates();
  }

  private async handleMessage(
    parsed: StdinCommand,
    requestId: string | undefined,
  ): Promise<void> {
    // If a turn is in flight, queue the user message instead of rejecting.
    if (this.running) {
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
      this.emit(
        'queued',
        { position: this.queue.length, ...this.queueFields() },
        requestId,
      );
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
      this.currentAbort = null;
      this.currentRequestId = undefined;
      this.running = false;
    }
  }

  /**
   * Drain the queue in strict FIFO order. Caller must hold `running = true`.
   * User messages arriving during the drain will be enqueued behind current items.
   *
   * Consecutive background-source items are coalesced into a single turn so
   * the LLM sees all the background results together and produces one
   * acknowledgment, not N separate ones.
   */
  private async drainQueueLoop(): Promise<void> {
    while (true) {
      const next = this.queue.shift();
      if (!next) {
        break;
      }

      // If this is a background item, coalesce any following background items
      // into a single combined message so the LLM sees all the results together
      // and produces one acknowledgment instead of N. Stops at the first
      // non-background item (which stays in the queue for the next iteration).
      if (next.source === 'background') {
        const batch = [next];
        while (this.queue.peek()?.source === 'background') {
          const more = this.queue.shift();
          if (more) {
            batch.push(more);
          }
        }
        const combinedCommand: StdinCommand = {
          action: 'message',
          text: mergeBackgroundResultsMessages(
            batch.map((b) => (b.command.text as string) ?? ''),
          ),
          ...(this.currentOnboardingState && {
            onboardingState: this.currentOnboardingState,
          }),
        };
        await this.runSingleTurn(combinedCommand, `background-${Date.now()}`);
        continue;
      }

      const nextRid =
        (next.command.requestId as string | undefined) ??
        `${next.source}-${Date.now()}`;
      await this.runSingleTurn(next.command, nextRid);
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

  /** Cancel the running turn and drain the queue. Returns the drained items. */
  private handleCancel(): QueuedMessage[] {
    if (this.currentAbort) {
      this.currentAbort.abort();
    }
    for (const [id, pending] of this.pendingTools) {
      clearTimeout(pending.timeout);
      pending.resolve('Error: cancelled');
      this.pendingTools.delete(id);
    }
    return this.queue.drain();
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

      // Paginated. `before` is an exclusive upper bound (default = end of
      // array, i.e. most recent messages). `limit` caps page size. Cursors
      // are integer indices into state.messages; the array is append-mostly
      // (compaction splices at the tail via findSafeInsertionPoint), so
      // historical indices stay stable across compactions.
      const total = this.state.messages.length;
      const rawLimit = parsed.limit;
      const limit =
        typeof rawLimit === 'number' && Number.isFinite(rawLimit)
          ? Math.min(Math.max(1, rawLimit | 0), HISTORY_MAX_LIMIT)
          : HISTORY_DEFAULT_LIMIT;
      const rawBefore = parsed.before;
      const before =
        typeof rawBefore === 'number' && Number.isFinite(rawBefore)
          ? Math.max(0, Math.min(rawBefore | 0, total))
          : total;
      const startIndex = Math.max(0, before - limit);
      const endIndex = before;

      this.dispatchSimple(requestId, 'history', () => ({
        messages: this.state.messages.slice(startIndex, endIndex),
        startIndex,
        endIndex,
        totalMessageCount: total,
        running: this.running,
        ...(this.running && this.currentRequestId
          ? { currentRequestId: this.currentRequestId }
          : {}),
        ...this.queueFields(),
      }));
      return;
    }

    if (action === 'clear') {
      this.dispatchSimple(requestId, 'session_cleared', () =>
        this.handleClear(),
      );
      return;
    }

    if (action === 'cancel') {
      const cancelled = this.handleCancel();
      // The in-flight message's completed(success:false, error:"cancelled")
      // is handled by onEvent when turn_cancelled fires. The cancel's own
      // completed reports what was drained so the sandbox can offer resume.
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
        });
        if (!this.running) {
          this.applyPendingSummaries();
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
