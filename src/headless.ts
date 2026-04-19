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
import {
  writeFileSync,
  readFileSync,
  unlinkSync,
  mkdirSync,
  existsSync,
} from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { basename, join, extname } from 'node:path';
import { createLogger } from './logger.js';
import type { Attachment } from './api.js';

const log = createLogger('headless');
import { resolveConfig } from './config.js';
import { buildSystemPrompt } from './prompt/index.js';
import {
  triggerCompaction,
  getPendingSummaries,
} from './compaction/trigger.js';
import { findSafeInsertionPoint } from './compaction/index.js';
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
  let turnStart = 0;
  // Chained action: if the current turn's automated action has a `next` field,
  // queue it for delivery after the turn completes.
  let pendingNextAction: string | undefined;

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
    const message = `@@automated::background_results@@\nThis is an automated message containing the result of a tool call that has been working in the background. This is not a direct message from the user.\n<background_results>\n${xmlParts}\n</background_results>`;

    // Deliver as an automated message — generate a requestId so the
    // sandbox sees turn_started/completed events and knows the agent is busy.
    const bgRequestId = `bg-${Date.now()}`;
    handleMessage({ action: 'message', text: message } as any, bgRequestId);
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

  /** Drain pending compaction summaries and insert at a safe point. */
  function applyPendingSummaries(): void {
    const summaries = getPendingSummaries();
    if (summaries.length === 0) {
      return;
    }
    const idx = findSafeInsertionPoint(state.messages);
    state.messages.splice(idx, 0, ...summaries);
    saveSession(state);
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
      case 'turn_started':
        emit('turn_started', {}, rid);
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
          sessionStats.lastContextSize =
            e.stats.lastCallInputTokens ?? e.stats.inputTokens;
        }
        sessionStats.messageCount = state.messages.length;
        sessionStats.updatedAt = Date.now();
        try {
          writeFileSync('.remy-stats.json', JSON.stringify(sessionStats));
        } catch {}
        emit(
          'completed',
          { success: true, durationMs: Date.now() - turnStart },
          rid,
        );
        // Apply queued mutations and flush results
        // (deferred to next tick so `running` is cleared first)
        setTimeout(() => {
          applyPendingSummaries();
          applyPendingBlockUpdates();
          // Chain takes priority over background results — it's a pipeline
          // continuation and starts a new turn (sets running = true).
          // Background results will flush after the chained turn completes.
          if (pendingNextAction) {
            const next = pendingNextAction;
            pendingNextAction = undefined;
            handleMessage(
              { action: 'message', text: `@@automated::${next}@@` } as any,
              `chain-${Date.now()}`,
            );
          } else {
            flushBackgroundQueue();
          }
        }, 0);
        return;
      case 'turn_cancelled': {
        completedEmitted = true;
        const cancelled: Record<string, unknown> = {
          success: false,
          error: 'cancelled',
        };
        if (pendingNextAction) {
          cancelled.pendingNextMessage = `@@automated::${pendingNextAction}@@`;
          pendingNextAction = undefined;
        }
        emit('completed', cancelled, rid);
        return;
      }

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
  // File upload persistence
  // ---------------------------------------------------------------------------

  const UPLOADS_DIR = 'src/.user-uploads';

  type PersistResult = {
    filename: string;
    localPath: string;
    remoteUrl: string;
    extractedTextPath?: string;
  } | null;

  function filenameFromUrl(url: string): string {
    try {
      const pathname = new URL(url).pathname;
      const name = basename(pathname);
      return name && name !== '/'
        ? decodeURIComponent(name)
        : `upload-${Date.now()}`;
    } catch {
      return `upload-${Date.now()}`;
    }
  }

  function resolveUniqueFilename(name: string): string {
    if (!existsSync(join(UPLOADS_DIR, name))) {
      return name;
    }
    const ext = extname(name);
    const base = name.slice(0, name.length - ext.length);
    let counter = 1;
    while (existsSync(join(UPLOADS_DIR, `${base}-${counter}${ext}`))) {
      counter++;
    }
    return `${base}-${counter}${ext}`;
  }

  const IMAGE_EXTENSIONS = new Set([
    '.png',
    '.jpg',
    '.jpeg',
    '.gif',
    '.webp',
    '.svg',
    '.bmp',
    '.ico',
    '.tiff',
    '.tif',
    '.avif',
    '.heic',
    '.heif',
  ]);

  function isImageAttachment(att: Attachment): boolean {
    const name = att.filename || filenameFromUrl(att.url);
    return IMAGE_EXTENSIONS.has(extname(name).toLowerCase());
  }

  async function persistAttachments(
    attachments: Attachment[],
  ): Promise<{ documents: PersistResult[]; images: PersistResult[] }> {
    // Skip voice messages (transcripts stay inline)
    const nonVoice = attachments.filter((a) => !a.isVoice);
    if (nonVoice.length === 0) {
      return { documents: [], images: [] };
    }

    mkdirSync(UPLOADS_DIR, { recursive: true });

    const results = await Promise.allSettled(
      nonVoice.map(async (att): Promise<PersistResult> => {
        const name = resolveUniqueFilename(
          att.filename || filenameFromUrl(att.url),
        );
        const localPath = join(UPLOADS_DIR, name);

        const res = await fetch(att.url, {
          signal: AbortSignal.timeout(30_000),
        });
        if (!res.ok) {
          throw new Error(`HTTP ${res.status} downloading ${att.url}`);
        }
        const buffer = Buffer.from(await res.arrayBuffer());
        await writeFile(localPath, buffer);
        log.info('Attachment saved', {
          filename: name,
          path: localPath,
          bytes: buffer.length,
        });

        let extractedTextPath: string | undefined;
        if (att.extractedTextUrl) {
          try {
            const textRes = await fetch(att.extractedTextUrl, {
              signal: AbortSignal.timeout(30_000),
            });
            if (textRes.ok) {
              extractedTextPath = `${localPath}.txt`;
              await writeFile(extractedTextPath, await textRes.text(), 'utf-8');
              log.info('Extracted text saved', { path: extractedTextPath });
            }
          } catch {
            // Non-fatal — sidecar download failed
          }
        }

        return {
          filename: name,
          localPath,
          remoteUrl: att.url,
          extractedTextPath,
        };
      }),
    );

    const settled = results.map((r, i) => ({
      result: r.status === 'fulfilled' ? r.value : null,
      isImage: isImageAttachment(nonVoice[i]),
    }));
    return {
      documents: settled.filter((s) => !s.isImage).map((s) => s.result),
      images: settled.filter((s) => s.isImage).map((s) => s.result),
    };
  }

  function buildUploadHeader(results: PersistResult[]): string {
    const succeeded = results.filter(Boolean) as Exclude<PersistResult, null>[];
    if (succeeded.length === 0) {
      return '';
    }
    if (succeeded.length === 1) {
      const r = succeeded[0];
      const parts = [`[Uploaded file: ${r.localPath} (CDN: ${r.remoteUrl})`];
      if (r.extractedTextPath) {
        parts.push(`extracted text: ${r.extractedTextPath}`);
      }
      return parts.join(' — ') + ']';
    }
    const lines = succeeded.map((r) => {
      const parts = [`- ${r.localPath} (CDN: ${r.remoteUrl})`];
      if (r.extractedTextPath) {
        parts.push(`  extracted text: ${r.extractedTextPath}`);
      }
      return parts.join('\n');
    });
    return `[Uploaded files]\n${lines.join('\n')}`;
  }

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
    turnStart = Date.now();

    const attachments = parsed.attachments as Attachment[] | undefined;
    if (attachments?.length) {
      log.info('Message has attachments', {
        count: attachments.length,
        urls: attachments.map((a) => a.url),
      });
    }

    // Persist file uploads to disk (skip voice messages)
    let userMessage = (parsed.text as string) ?? '';
    if (attachments?.some((a) => !a.isVoice)) {
      try {
        const { documents, images } = await persistAttachments(attachments);
        const all = [...documents, ...images];
        const header = buildUploadHeader(all);
        if (header) {
          userMessage = userMessage ? `${header}\n\n${userMessage}` : header;
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
      emit(
        'completed',
        { success: false, error: err.message || 'Failed to resolve action' },
        requestId,
      );
      return;
    }
    pendingNextAction = undefined;
    if (resolved !== null) {
      userMessage = resolved.message;
      pendingNextAction = resolved.next;
    }
    const isHidden = resolved !== null || !!(parsed.hidden as boolean);

    // Update .remy-plan.md before building the system prompt so the
    // injected <pending_plan>/<approved_plan> note reflects the new state.
    const rawText = (parsed.text as string) ?? '';
    if (
      rawText.startsWith('@@automated::approvePlan@@') ||
      rawText.startsWith('@@automated::approveInitialPlan@@')
    ) {
      try {
        const plan = readFileSync('.remy-plan.md', 'utf-8');
        writeFileSync(
          '.remy-plan.md',
          plan.replace(/^status:\s*pending/m, 'status: approved'),
          'utf-8',
        );
      } catch {}
    } else if (rawText.startsWith('@@automated::rejectPlan@@')) {
      try {
        unlinkSync('.remy-plan.md');
      } catch {}
    }

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
      } else if (!running) {
        // No pending tool and no active turn — likely a late result after
        // restart (session sanitization already patched the conversation).
        // Emit completed so the frontend dismisses any stale overlay.
        log.info('Late tool_result while idle, dismissing', { id });
        emit('completed', { success: true }, requestId);
      } else {
        earlyResults.set(id, result);
      }
      return;
    }

    if (action === 'get_history') {
      // Flush any queued background results so history is up-to-date
      // (background completions are deferred while a turn is in progress,
      // but callers — e.g., sandbox init frame — need the latest state).
      applyPendingBlockUpdates();
      dispatchSimple(requestId, 'history', () => ({
        messages: state.messages,
        running,
        ...(running && currentRequestId ? { currentRequestId } : {}),
      }));
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
      triggerCompaction(state, config, {
        onStart: () => {
          sessionStats.compactionInProgress = true;
          sessionStats.updatedAt = Date.now();
          try {
            writeFileSync('.remy-stats.json', JSON.stringify(sessionStats));
          } catch {}
        },
        onSummariesReady: () => {
          if (!running) {
            applyPendingSummaries();
          }
          emit('compaction_complete', {}, requestId);
          emit('completed', { success: true }, requestId);
        },
        onError: (error) => {
          emit('compaction_complete', { error }, requestId);
          emit('completed', { success: false, error }, requestId);
        },
        onFinally: () => {
          sessionStats.compactionInProgress = false;
          sessionStats.lastContextSize = 0;
          sessionStats.messageCount = state.messages.length;
          sessionStats.updatedAt = Date.now();
          try {
            writeFileSync('.remy-stats.json', JSON.stringify(sessionStats));
          } catch {}
        },
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
