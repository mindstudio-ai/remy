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
 */

import { createInterface } from 'node:readline';
import { writeFileSync } from 'node:fs';
import { createLogger } from './logger.js';

const log = createLogger('headless');
import { resolveConfig } from './config.js';
import { buildSystemPrompt } from './prompt/index.js';
import { compactConversation } from './compaction/index.js';
import { setLspBaseUrl } from './tools/_helpers/lsp.js';
import {
  createAgentState,
  runTurn,
  type AgentState,
  type AgentEvent,
} from './agent.js';
import { loadSession, clearSession, saveSession } from './session.js';
import type { StdinCommand } from './types.js';
import { ToolRegistry } from './toolRegistry.js';

export interface HeadlessOptions {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  lspUrl?: string;
}

import { resolveAction } from './automatedActions/resolve.js';

// ---------------------------------------------------------------------------
// Wire protocol emit
// ---------------------------------------------------------------------------

function emit(
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

// ---------------------------------------------------------------------------
// Simple command handlers — pure functions that return data or throw
// ---------------------------------------------------------------------------

function handleGetHistory(state: AgentState): Record<string, unknown> {
  return { messages: state.messages };
}

function handleClear(state: AgentState): Record<string, unknown> {
  clearSession(state);
  return {};
}

function handleCancel(
  currentAbort: AbortController | null,
  pendingTools: Map<
    string,
    { resolve: (r: string) => void; timeout?: ReturnType<typeof setTimeout> }
  >,
): Record<string, unknown> {
  if (currentAbort) {
    currentAbort.abort();
  }
  for (const [id, pending] of pendingTools) {
    clearTimeout(pending.timeout);
    pending.resolve('Error: cancelled');
    pendingTools.delete(id);
  }
  return {};
}

/**
 * Dispatch a simple (non-streaming) command: call the handler, emit an
 * optional named event with its return data, then always emit `completed`.
 */
function dispatchSimple(
  requestId: string | undefined,
  eventName: string | null,
  handler: () => Record<string, unknown>,
): void {
  try {
    const data = handler();
    if (eventName) {
      emit(eventName, data, requestId);
    }
    emit('completed', { success: true }, requestId);
  } catch (err: any) {
    emit('completed', { success: false, error: err.message }, requestId);
  }
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

export async function startHeadless(opts: HeadlessOptions = {}): Promise<void> {
  // Redirect console to stderr so stdout stays clean for the JSON protocol
  const stderrWrite = (...args: unknown[]) => {
    process.stderr.write(args.map(String).join(' ') + '\n');
  };
  console.log = stderrWrite;
  console.warn = stderrWrite;
  console.info = stderrWrite;

  if (opts.lspUrl) {
    setLspBaseUrl(opts.lspUrl);
  }

  const config = resolveConfig({
    apiKey: opts.apiKey,
    baseUrl: opts.baseUrl,
  });
  const state: AgentState = createAgentState();
  const resumed = loadSession(state);
  if (resumed) {
    emit('session_restored', { messageCount: state.messages.length });
  }

  let running = false;
  let currentAbort: AbortController | null = null;

  // Track the requestId of the in-flight message command so onEvent can
  // inject it into every streamed event.
  let currentRequestId: string | undefined;
  // Guard: runTurn may or may not emit turn_done/turn_cancelled. We track
  // whether a terminal `completed` was already sent so we emit exactly one.
  let completedEmitted = false;

  // ---------------------------------------------------------------------------
  // External tool results — keyed by tool call id.
  // ---------------------------------------------------------------------------
  const EXTERNAL_TOOL_TIMEOUT_MS = 300_000; // 5 minutes
  const pendingTools = new Map<
    string,
    {
      resolve: (result: string) => void;
      timeout?: ReturnType<typeof setTimeout>;
    }
  >();
  const earlyResults = new Map<string, string>();

  // Tool lifecycle management — shared across all nesting depths
  const toolRegistry = new ToolRegistry();

  // Background agent result queue — flushed after each turn or immediately if idle
  // Session-level stats — accumulated across turns, written to .remy-stats.json
  const sessionStats = {
    messageCount: 0,
    turns: 0,
    totalInputTokens: 0,
    totalOutputTokens: 0,
    totalCacheCreationTokens: 0,
    totalCacheReadTokens: 0,
    lastContextSize: 0,
    compactionInProgress: false,
    updatedAt: 0,
  };

  const backgroundQueue: Array<{
    toolCallId: string;
    name: string;
    result: string;
    completedAt: number;
  }> = [];

  function flushBackgroundQueue(): void {
    if (backgroundQueue.length === 0) {
      return;
    }

    const results = backgroundQueue.splice(0);
    const xmlParts = results
      .map(
        (r) =>
          `<tool_result id="${r.toolCallId}" name="${r.name}">\n${r.result}\n</tool_result>`,
      )
      .join('\n\n');
    const message = `@@automated::background_results@@\n<background_results>\n${xmlParts}\n</background_results>`;

    // Deliver as an automated message — frontend identifies it by the @@automated:: prefix
    handleMessage({ action: 'message', text: message } as any, undefined);
  }

  /** Pending tool block updates from background completions — applied when idle. */
  const pendingBlockUpdates: Array<{
    toolCallId: string;
    result: string;
    subAgentMessages?: import('./api.js').Message[];
  }> = [];

  /** Apply queued tool block updates to state.messages. Safe to call only when idle. */
  function applyPendingBlockUpdates(): void {
    if (pendingBlockUpdates.length === 0) {
      return;
    }
    const updates = pendingBlockUpdates.splice(0);
    for (const update of updates) {
      for (const msg of state.messages) {
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
  }

  function onBackgroundComplete(
    toolCallId: string,
    name: string,
    result: string,
    subAgentMessages?: import('./api.js').Message[],
  ): void {
    // Queue the tool block update — don't mutate state.messages mid-turn
    pendingBlockUpdates.push({ toolCallId, result, subAgentMessages });

    log.info('Background complete', {
      toolCallId,
      name,
      requestId: currentRequestId,
    });

    // Emit event so frontend can update immediately
    onEvent({
      type: 'tool_background_complete',
      id: toolCallId,
      name,
      result,
    });

    // Queue the synthetic message for the LLM
    backgroundQueue.push({
      toolCallId,
      name,
      result,
      completedAt: Date.now(),
    });

    // If idle, apply updates and deliver immediately.
    // Otherwise queued for after turn_done.
    if (!running) {
      applyPendingBlockUpdates();
      flushBackgroundQueue();
    }
  }

  // Tools that wait on user input — no timeout
  const USER_FACING_TOOLS = new Set([
    'promptUser',
    'confirmDestructiveAction',
    'presentPlan',
    'presentSyncPlan',
    'presentPublishPlan',
  ]);

  function resolveExternalTool(
    id: string,
    name: string,
    _input: Record<string, any>,
  ): Promise<string> {
    const early = earlyResults.get(id);
    if (early !== undefined) {
      earlyResults.delete(id);
      return Promise.resolve(early);
    }

    const shouldTimeout = !USER_FACING_TOOLS.has(name);
    return new Promise<string>((resolve) => {
      const timeout = shouldTimeout
        ? setTimeout(() => {
            pendingTools.delete(id);
            resolve(
              'Error: Tool timed out — no response from the app environment after 5 minutes.',
            );
          }, EXTERNAL_TOOL_TIMEOUT_MS)
        : undefined;

      pendingTools.set(id, {
        resolve: (result: string) => {
          clearTimeout(timeout);
          resolve(result);
        },
        timeout,
      });
    });
  }

  // ---------------------------------------------------------------------------
  // AgentEvent → wire protocol translation
  // ---------------------------------------------------------------------------

  function onEvent(e: AgentEvent): void {
    const rid = currentRequestId;

    switch (e.type) {
      // Suppressed — caller already knows the request started
      case 'turn_started':
        return;

      // Terminal events — translate to `completed`
      case 'turn_done':
        completedEmitted = true;
        // Accumulate session stats
        if (e.stats) {
          sessionStats.turns++;
          sessionStats.totalInputTokens += e.stats.inputTokens;
          sessionStats.totalOutputTokens += e.stats.outputTokens;
          sessionStats.totalCacheCreationTokens +=
            e.stats.cacheCreationTokens ?? 0;
          sessionStats.totalCacheReadTokens += e.stats.cacheReadTokens ?? 0;
          sessionStats.lastContextSize = e.stats.inputTokens;
        }
        sessionStats.messageCount = state.messages.length;
        sessionStats.updatedAt = Date.now();
        try {
          writeFileSync('.remy-stats.json', JSON.stringify(sessionStats));
        } catch {}
        emit('completed', { success: true }, rid);
        // Apply queued background mutations and flush results
        // (deferred to next tick so `running` is cleared first)
        setTimeout(() => {
          applyPendingBlockUpdates();
          flushBackgroundQueue();
        }, 0);
        return;
      case 'turn_cancelled':
        completedEmitted = true;
        emit('completed', { success: false, error: 'cancelled' }, rid);
        return;

      // Streaming events — forward with requestId
      case 'text':
        emit(
          'text',
          {
            text: e.text,
            ...(e.parentToolId && { parentToolId: e.parentToolId }),
          },
          rid,
        );
        return;
      case 'thinking':
        emit(
          'thinking',
          {
            text: e.text,
            ...(e.parentToolId && { parentToolId: e.parentToolId }),
          },
          rid,
        );
        return;
      case 'tool_input_delta':
        emit(
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
        emit(
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
        emit(
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
        emit(
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
        emit(
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
        emit(
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
        emit(
          'status',
          {
            message: e.message,
            ...(e.parentToolId && { parentToolId: e.parentToolId }),
          },
          rid,
        );
        return;
      case 'error':
        emit('error', { error: e.error }, rid);
        return;
    }
  }

  // Wire registry events through the same onEvent handler
  toolRegistry.onEvent = onEvent;

  // ---------------------------------------------------------------------------
  // Message command handler (long-running / streaming)
  // ---------------------------------------------------------------------------

  async function handleMessage(
    parsed: StdinCommand,
    requestId: string | undefined,
  ): Promise<void> {
    if (running) {
      emit(
        'error',
        { error: 'Agent is already processing a message' },
        requestId,
      );
      emit(
        'completed',
        { success: false, error: 'Agent is already processing a message' },
        requestId,
      );
      return;
    }

    running = true;
    currentRequestId = requestId;
    currentAbort = new AbortController();
    completedEmitted = false;
    const turnStart = Date.now();

    const attachments = parsed.attachments as
      | Array<{ url: string; extractedTextUrl?: string }>
      | undefined;
    if (attachments?.length) {
      console.warn(
        `[headless] Message has ${attachments.length} attachment(s):`,
        attachments.map((a: { url: string }) => a.url),
      );
    }

    // Resolve @@automated:: actions — loads prompt, interpolates params
    let userMessage = (parsed.text as string) ?? '';
    let resolved: string | null = null;
    try {
      resolved = resolveAction(userMessage);
    } catch (err: any) {
      emit(
        'completed',
        { success: false, error: err.message || 'Failed to resolve action' },
        requestId,
      );
      return;
    }
    if (resolved !== null) {
      userMessage = resolved;
    }
    const isHidden = resolved !== null || !!(parsed.hidden as boolean);

    const onboardingState =
      (parsed.onboardingState as string) ?? 'onboardingFinished';
    const system = buildSystemPrompt(
      onboardingState,
      parsed.viewContext as any,
    );

    try {
      await runTurn({
        state,
        userMessage,
        attachments,
        apiConfig: config,
        system,
        model: opts.model,
        onboardingState,
        requestId,
        signal: currentAbort.signal,
        onEvent,
        resolveExternalTool,
        hidden: isHidden,
        toolRegistry,
        onBackgroundComplete,
      });
      // runTurn may have emitted turn_done or turn_cancelled (→ completed).
      // If it returned without either (e.g. streaming error early-return),
      // we need to emit the terminal event ourselves.
      if (!completedEmitted) {
        emit(
          'completed',
          { success: false, error: 'Turn ended unexpectedly' },
          requestId,
        );
      }
      log.info('Turn complete', {
        requestId,
        durationMs: Date.now() - turnStart,
      });
    } catch (err: any) {
      if (!completedEmitted) {
        emit('error', { error: err.message }, requestId);
        emit('completed', { success: false, error: err.message }, requestId);
      }
      log.warn('Command failed', {
        action: 'message',
        requestId,
        error: err.message,
      });
    }

    currentAbort = null;
    currentRequestId = undefined;
    running = false;
  }

  // ---------------------------------------------------------------------------
  // Stdin router
  // ---------------------------------------------------------------------------

  const rl = createInterface({ input: process.stdin });

  rl.on('line', async (line: string) => {
    let parsed: StdinCommand;
    try {
      parsed = JSON.parse(line);
    } catch {
      emit('error', { error: 'Invalid JSON on stdin' });
      return;
    }

    const { action, requestId } = parsed;
    log.info('Command received', { action, requestId });

    // tool_result: fire-and-forget, resolves a pending external tool promise
    if (action === 'tool_result' && parsed.id) {
      const id = parsed.id as string;
      const result = (parsed.result as string) ?? '';
      const pending = pendingTools.get(id);
      if (pending) {
        pendingTools.delete(id);
        pending.resolve(result);
      } else {
        earlyResults.set(id, result);
      }
      return;
    }

    if (action === 'get_history') {
      dispatchSimple(requestId, 'history', () => handleGetHistory(state));
      return;
    }

    if (action === 'clear') {
      dispatchSimple(requestId, 'session_cleared', () => handleClear(state));
      return;
    }

    if (action === 'cancel') {
      handleCancel(currentAbort, pendingTools);
      // The in-flight message's completed(success:false, error:"cancelled")
      // is handled by onEvent when turn_cancelled fires.
      emit('completed', { success: true }, requestId);
      return;
    }

    if (action === 'stop_tool') {
      const id = parsed.id as string;
      const mode = ((parsed.mode as string) ?? 'hard') as 'graceful' | 'hard';
      const found = toolRegistry.stop(id, mode);
      if (found) {
        emit('completed', { success: true }, requestId);
      } else {
        emit(
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
      const found = toolRegistry.restart(id, patchedInput);
      if (found) {
        emit('completed', { success: true }, requestId);
      } else {
        emit(
          'completed',
          { success: false, error: 'Tool not found' },
          requestId,
        );
      }
      return;
    }

    if (action === 'compact') {
      sessionStats.compactionInProgress = true;
      sessionStats.updatedAt = Date.now();
      try {
        writeFileSync('.remy-stats.json', JSON.stringify(sessionStats));
      } catch {}
      // Run in background — does not block the conversation. Snapshots the
      // current message index and inserts checkpoints there when done.
      compactConversation(state, config)
        .then(() => {
          saveSession(state);
          emit('compaction_complete', {}, requestId);
          emit('completed', { success: true }, requestId);
        })
        .catch((err: any) => {
          emit(
            'compaction_complete',
            { error: err.message || 'Compaction failed' },
            requestId,
          );
          emit(
            'completed',
            { success: false, error: err.message || 'Compaction failed' },
            requestId,
          );
        })
        .finally(() => {
          sessionStats.compactionInProgress = false;
          sessionStats.messageCount = state.messages.length;
          sessionStats.updatedAt = Date.now();
          try {
            writeFileSync('.remy-stats.json', JSON.stringify(sessionStats));
          } catch {}
        });
      return;
    }

    if (action === 'message') {
      await handleMessage(parsed, requestId);
      return;
    }

    // Unknown action
    emit('error', { error: `Unknown action: ${action}` }, requestId);
    emit(
      'completed',
      { success: false, error: `Unknown action: ${action}` },
      requestId,
    );
  });

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  rl.on('close', () => {
    emit('stopping');
    emit('stopped');
    process.exit(0);
  });

  function shutdown() {
    emit('stopping');
    emit('stopped');
    process.exit(0);
  }

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);

  emit('ready');
}
