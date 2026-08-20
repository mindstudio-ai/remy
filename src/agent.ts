/**
 * Agent loop — the core tool-call loop.
 *
 * Pure async, no UI dependencies. The TUI (or later the sandbox C&C
 * server) provides an onEvent callback to render agent activity.
 *
 * Flow per user message:
 *   1. Send conversation + tools to the platform
 *   2. Stream response (text, thinking, tool_use events)
 *   3. If stopReason is tool_use: execute all tool calls in parallel,
 *      append results to conversation, go back to step 1
 *   4. If stopReason is end_turn: done — wait for next user message
 *
 * Conversation state accumulates across turns within a session, so the
 * agent has full context of everything it's done so far.
 *
 * Pass an AbortSignal to cancel mid-turn. The signal aborts the SSE
 * stream and skips pending tool execution.
 */

import {
  streamChatWithRetry,
  type Message,
  type ContentBlock,
  type Attachment,
  type StreamEvent,
} from './api.js';
import {
  executeTool,
  getToolByName,
  getToolDefinitions,
} from './tools/index.js';
import { saveSession } from './session.js';
import { createLogger } from './logger.js';
import { recordUsage, nanoToDollars } from './usageLedger.js';
import type { ApiConfig } from './config.js';

const log = createLogger('agent');
import { parsePartialJson } from './parsePartialJson.js';
import { startStatusWatcher, sanitizeStatusText } from './statusWatcher.js';
import { NON_ACTION_SENTINELS } from './automatedActions/resolve.js';
import { friendlyError } from './errors.js';

import { cleanMessagesForApi } from './subagents/common/cleanMessages.js';
import { parseSentinel } from './automatedActions/sentinel.js';
import { triggerBrandExtraction } from './brandExtraction/trigger.js';
import { resolveModel, filterModelPicks } from './models/surfaces.js';
import { USER_CANCELLED_RESULT } from './toolRegistry.js';
import { capToolResult } from './toolResultCap.js';

// Tools whose success can change a brand-extraction gate input: spec writes
// (may touch @brand/ or design/color|typography specs) and metadata updates
// (mindstudio.json name/description/iconUrl). The gate hash inside the trigger
// makes false positives free.
const BRAND_TRIGGERING_TOOLS = new Set([
  'writeSpec',
  'editSpec',
  'setProjectMetadata',
]);

// Content block helpers
function getTextContent(blocks: ContentBlock[]): string {
  return blocks
    .filter((b): b is ContentBlock & { type: 'text' } => b.type === 'text')
    .map((b) => b.text)
    .join('');
}

function getToolCalls(
  blocks: ContentBlock[],
): Array<{ id: string; name: string; input: Record<string, any> }> {
  return blocks.filter(
    (b): b is ContentBlock & { type: 'tool' } => b.type === 'tool',
  );
}

// Tools where the result comes from outside (sandbox/user), not local execution.
const EXTERNAL_TOOLS = new Set([
  'promptUser',
  'setProjectOnboardingState',
  'presentPublishPlan',
  'confirmDestructiveAction',
  'runScenario',
  'runMethod',
  'queryDatabase',
  'browserCommand',
  'setProjectMetadata',
]);

// Subset of EXTERNAL_TOOLS that block on a user action (clicking approve,
// answering a form). While one of these is awaiting a result the status
// watcher should pause — generated labels like "Aligning on design" while
// the user reads a plan are misleading.
const USER_BLOCKING_EXTERNAL_TOOLS = new Set([
  'promptUser',
  'presentPublishPlan',
  'confirmDestructiveAction',
]);

/**
 * Whether a tool call runs in the background — either the model set the
 * `background` input flag, or the tool is inherently background-only
 * (`Tool.backgroundOnly`). Background calls stay registered past the turn
 * (the sub-agent runner owns their lifecycle) and render a background
 * indicator in the UI.
 */
function isBackgroundCall(tc: {
  name: string;
  input: Record<string, any>;
}): boolean {
  return Boolean(
    tc.input?.background || getToolByName(tc.name)?.backgroundOnly,
  );
}

export type {
  AgentEvent,
  AgentState,
  ExternalToolResolver,
  TurnEntry,
} from './types.js';
import type {
  AgentEvent,
  AgentState,
  ExternalToolResolver,
  TurnEntry,
} from './types.js';

export function createAgentState(): AgentState {
  return { messages: [] };
}

/**
 * Run one user turn — may involve multiple LLM round-trips if the
 * model requests tool calls. Returns when the model is done responding
 * or the signal is aborted.
 */
export async function runTurn(params: {
  state: AgentState;
  /** Ordered user-visible messages for this turn. Usually one; a merged
   * mailbox turn (queued user messages + background results delivered
   * together) has several — each becomes its own history entry and
   * user_message event, sharing one API call and tool loop. */
  entries: TurnEntry[];
  apiConfig: ApiConfig;
  system: string;
  model?: string;
  /** Per-build model override from the approve message; applies to this turn's
   * parent surface only. Not persisted — scoped to the single build turn. */
  buildModel?: string;
  onboardingState: string;
  signal?: AbortSignal;
  onEvent: (event: AgentEvent) => void;
  /** Pull hook for ASAP-promoted queued messages. Called at each tool
   * boundary (after tool results are appended, before the next LLM call);
   * returned entries are injected into the running turn as plain user
   * messages. The caller owns removal from its queue and terminal
   * (`absorbed`) accounting for the consumed requestIds. */
  takeSteering?: () => Promise<TurnEntry[]>;
  resolveExternalTool?: ExternalToolResolver;
  /** Correlation ID from the headless protocol — threaded for structured logging. */
  requestId?: string;
  toolRegistry?: import('./toolRegistry.js').ToolRegistry;
  onBackgroundComplete?: (
    toolCallId: string,
    name: string,
    result: string,
    subAgentMessages?: import('./api.js').Message[],
  ) => void;
}): Promise<void> {
  const {
    state,
    entries,
    apiConfig,
    system,
    model,
    buildModel,
    onboardingState,
    signal,
    onEvent,
    takeSteering,
    resolveExternalTool,
    requestId,
    toolRegistry,
    onBackgroundComplete,
  } = params;
  const tools = getToolDefinitions();

  // Per-build executor model: the approve message may carry a `buildModel`
  // that runs this build turn's parent surface on a non-default model. Scoped
  // to this one turn (not persisted) and applied only to `parent` — subagents
  // keep resolving their own surfaces. Validated against the text allow-list;
  // an invalid pick falls through to the default.
  const buildModelOverride = buildModel
    ? filterModelPicks({ parent: buildModel }).parent
    : undefined;
  // Resolve the parent model once per turn (deterministic: state.models is
  // frozen while a turn runs). `baseline` is what the user would otherwise get
  // (including any manual pick); a build override that diverges from it is
  // recorded as `modelOverride` so history/UI can flag it, while a manual pick
  // — folded into `baseline` — is intentionally left unflagged.
  const baseline = resolveModel('parent', state.models, model);
  const parentModel = buildModelOverride ?? baseline;
  const modelOverride =
    buildModelOverride && buildModelOverride !== baseline
      ? { from: baseline }
      : undefined;

  const totalAttachments = entries.reduce(
    (n, e) => n + (e.attachments?.length ?? 0),
    0,
  );
  log.info('Turn started', {
    requestId,
    model,
    buildModel: buildModelOverride,
    toolCount: tools.length,
    ...(entries.length > 1 && { entryCount: entries.length }),
    ...(totalAttachments > 0 && { attachmentCount: totalAttachments }),
  });

  onEvent({
    type: 'turn_started',
    model: parentModel,
    ...(modelOverride && { modelOverride }),
  });

  // Store the original messages (with @@automated:: prefix if present) in
  // history so the frontend can identify automated messages. The prefix is
  // stripped by cleanMessagesForApi before sending to the LLM.
  // Reject entries with no text and no attachments; error only if none survive.
  const keptEntries = entries.filter(
    (e) => e.text.trim().length > 0 || (e.attachments?.length ?? 0) > 0,
  );
  if (keptEntries.length === 0) {
    onEvent({ type: 'error', error: 'Empty message' });
    return;
  }

  // Push one turn entry into history and emit its user_message event. Used
  // for the turn's opening entries and for ASAP messages injected mid-turn
  // via takeSteering.
  const appendEntry = (entry: TurnEntry): void => {
    const hasAttachments = (entry.attachments?.length ?? 0) > 0;
    const userMsg: Message = { role: 'user', content: entry.text };
    if (entry.hidden) {
      userMsg.hidden = true;
    }
    if (hasAttachments) {
      userMsg.attachments = entry.attachments;
    }
    if (entry.attachmentHeader) {
      userMsg.attachmentHeader = entry.attachmentHeader;
    }
    state.messages.push(userMsg);
    onEvent({
      type: 'user_message',
      text: entry.text,
      hidden: entry.hidden || undefined,
      // Include attachments so the live event can render a queued voice/image/file
      // bubble; a voice message has empty text and the transcript lives here.
      ...(hasAttachments && { attachments: entry.attachments }),
      ...(entry.requestId && { requestId: entry.requestId }),
      ...(entry.queued && { queued: true }),
    });
  };

  for (const entry of keptEntries) {
    appendEntry(entry);
  }

  // Skip status labels on the very first message — too little context to
  // generate anything useful and the results come out awkward.
  const isFirstMessage =
    state.messages.filter((m) => m.role === 'user').length === 1;

  // Tool-call loop: keep going until the model stops requesting tools
  // Internal tools that are invisible to the user — exclude from status labels
  const STATUS_EXCLUDED_TOOLS = new Set([
    'setProjectOnboardingState',
    'setProjectMetadata',
    'editsFinished',
  ]);

  // Track last tool context across loop iterations so the status watcher
  // has something to report while waiting for the model's first token.
  let lastCompletedTools = '';
  let lastCompletedInput = '';
  let lastCompletedResult = '';

  // Mutable state for the unified status watcher. Declared outside the loop
  // because the watcher itself is one-per-turn now; each iteration resets
  // them and points contentBlocksRef at its own block list.
  let subAgentText = '';
  let currentToolNames = '';
  let contentBlocksRef: ContentBlock[] = [];

  // Token usage accumulators across loop iterations
  let turnInputTokens = 0;
  let turnOutputTokens = 0;
  let turnCacheCreation = 0;
  let turnCacheRead = 0;
  let turnLlmCalls = 0;
  // Last individual LLM call's usage (not accumulated) — used for context size
  let lastCallInputTokens = 0;
  let lastCallCacheCreation = 0;
  let lastCallCacheRead = 0;

  // One watcher for the whole turn, stopped in the finally below. It used to
  // be created per loop iteration, which both multiplied requests (each new
  // watcher fires immediately) and leaked a live 5s interval on any exit path
  // that didn't stop it explicitly — the streaming-error path never did, so
  // an out-of-credits turn left a poller running for the process's lifetime.
  const statusWatcher = isFirstMessage
    ? { stop() {}, pause() {}, resume() {} }
    : startStatusWatcher({
        apiConfig,
        getContext: () => {
          const parts: string[] = [];
          // Current activity first — this is what matters most
          const toolName =
            currentToolNames ||
            getToolCalls(contentBlocksRef)
              .filter((tc) => !STATUS_EXCLUDED_TOOLS.has(tc.name))
              .at(-1)?.name ||
            lastCompletedTools;
          if (toolName) {
            parts.push(`Tool: ${toolName}`);
          }
          const toolInput = sanitizeStatusText(lastCompletedInput);
          if (toolInput) {
            parts.push(`Tool input: ${toolInput.slice(-1500)}`);
          }
          const toolResult = sanitizeStatusText(lastCompletedResult);
          if (toolResult) {
            parts.push(`Tool result: ${toolResult.slice(-1500)}`);
          }
          const text =
            subAgentText || getTextContent(contentBlocksRef).slice(-2000);
          if (text) {
            parts.push(`Assistant text: ${text}`);
          }
          // Background context — stale quickly but useful when nothing else is happening
          if (onboardingState && onboardingState !== 'onboardingFinished') {
            parts.push(`Build phase: ${onboardingState}`);
          }
          // For automated actions (chained build steps, approveInitialPlan,
          // etc.), surface only the action name — not the body. The body is
          // instructional text ("end the turn, build will start") that the
          // status generator would faithfully but misleadingly summarize as
          // "Ending turn, build starting." A merged turn can carry both a
          // background_results entry and plain user text — surface each kind.
          let hasUserSignal = false;
          for (const entry of keptEntries) {
            // Hidden entries were never shown to the user (injected background
            // results, passive sweeps) — they must not shape a user-facing label.
            if (entry.hidden) {
              continue;
            }
            const automated = parseSentinel(entry.text);
            if (automated) {
              // Non-action sentinels are plumbing, not actions; their name
              // ("background_results") leaks straight into the label.
              if (!NON_ACTION_SENTINELS.has(automated.name)) {
                parts.push(`Automated action: ${automated.name}`);
                hasUserSignal = true;
              }
            } else if (entry.text) {
              parts.push(`User request: ${entry.text.slice(-500)}`);
              hasUserSignal = true;
            }
          }
          // A turn made up entirely of internal payloads has nothing a label
          // could honestly describe — returning '' skips the request outright.
          if (!hasUserSignal && !toolName && !text) {
            return '';
          }
          return parts.join('\n');
        },
        onStatus: (label) => onEvent({ type: 'status', message: label }),
        signal,
      });

  try {
    while (true) {
      if (signal?.aborted) {
        onEvent({ type: 'turn_cancelled' });
        saveSession(state);
        return;
      }

      const iterStart = Date.now();
      const contentBlocks: ContentBlock[] = [];
      // Start times for each thinking block in arrival order. The platform
      // emits one `thinking` event with `text: ''` per block start, then
      // emits all `thinking_complete` events at end of stream from
      // finalMessage.content. Tracking starts as a queue (rather than a
      // single accumulator) keeps interleaved-thinking blocks in their
      // original positions after the contentBlocks sort by startedAt —
      // a single accumulator caused the second-and-later thinking blocks
      // to receive startedAt: 0, which then sorted them ahead of every
      // text/tool block and corrupted the message in a way Anthropic
      // rejects on the next request via signature validation.
      const thinkingBlockStartTimes: number[] = [];
      let thinkingCompleteCount = 0;
      // Tracks the startedAt of the most recent thinking or redacted_thinking
      // block so a `redacted_thinking_complete` event (which has no streaming
      // start time) can sort just after it, before any text/tool block.
      let lastThinkingRelatedStartedAt: number | undefined;
      // True when the most recent block-producing event was a text event with
      // no thinking-block boundary since. New text events merge into the last
      // text block while this is true; cleared at thinking-block starts so
      // text segments separated by interleaved thinking stay as distinct
      // blocks. Without this, two text streams sandwiching a thinking block
      // get concatenated into one and the resulting assistant message has a
      // shape that doesn't match what the API originally returned, which
      // trips Anthropic's thinking-block signature validation on the next
      // request.
      let textBlockOpen = false;
      const toolInputAccumulators = new Map<string, ToolInputAcc>();
      let stopReason = 'end_turn';
      // Opaque provider state from this call's `done` event. Round-tripped on
      // the assistant message so the next request can pass it back verbatim
      // (required for OpenAI Responses stateless reasoning).
      let turnProviderMetadata: Record<string, any> | undefined;
      // Authoritative model id echoed by the adapter on this call's `done`
      // event; persisted on the assistant message for history attribution.
      let turnModelId: string | undefined;

      // Point the turn's watcher at this iteration's blocks and clear the
      // per-iteration activity state it reads.
      contentBlocksRef = contentBlocks;
      subAgentText = '';
      currentToolNames = '';

      type ToolInputAcc = {
        name: string;
        json: string;
        started: boolean;
        lastEmittedCount: number;
      };

      function getOrCreateAccumulator(id: string, name: string): ToolInputAcc {
        let acc = toolInputAccumulators.get(id);
        if (!acc) {
          acc = { name, json: '', started: false, lastEmittedCount: 0 };
          toolInputAccumulators.set(id, acc);
        }
        return acc;
      }

      async function handlePartialInput(
        acc: ToolInputAcc,
        id: string,
        name: string,
        partial: Record<string, any>,
      ): Promise<void> {
        const tool = getToolByName(name);
        if (!tool?.streaming) {
          return;
        }

        const {
          contentField = 'content',
          transform,
          partialInput,
        } = tool.streaming;

        // Input streaming mode (progressive tool_start with partial: true)
        if (partialInput) {
          const result = partialInput(partial, acc.lastEmittedCount);
          if (!result) {
            return;
          }
          acc.lastEmittedCount = result.emittedCount;
          acc.started = true;
          onEvent({
            type: 'tool_start',
            id,
            name,
            input: result.input,
            partial: true,
          });
          return;
        }

        // Content streaming mode (tool_input_delta)
        const content = partial[contentField];
        if (typeof content !== 'string') {
          return;
        }

        if (!acc.started) {
          acc.started = true;
          onEvent({ type: 'tool_start', id, name, input: partial });
        }

        if (transform) {
          const result = await transform(partial);
          if (result === null) {
            return;
          }
          onEvent({ type: 'tool_input_delta', id, name, result });
        } else {
          onEvent({ type: 'tool_input_delta', id, name, result: content });
        }
      }

      // Stream one LLM turn using the per-turn parent model resolved above.
      try {
        for await (const event of streamChatWithRetry(
          {
            ...apiConfig,
            model: parentModel,
            requestId,
            system,
            messages: cleanMessagesForApi(state.messages),
            tools,
            // The parent is one long-lived conversation re-read across turns
            // with multi-minute gaps — the 1h-TTL profile.
            cachePolicy: 'conversation',
            signal,
          },
          {
            onRetry: (attempt) => {
              onEvent({
                type: 'status',
                message: `Lost connection, retrying (attempt ${attempt + 2} of 3)`,
              });
            },
          },
        )) {
          if (signal?.aborted) {
            break;
          }

          switch (event.type) {
            case 'text': {
              // Append to the last text block when one is open. A thinking-
              // block start clears textBlockOpen so a text segment after
              // interleaved thinking starts its own block.
              const lastBlock = contentBlocks.at(-1);
              if (lastBlock?.type === 'text' && textBlockOpen) {
                lastBlock.text += event.text;
              } else {
                contentBlocks.push({
                  type: 'text',
                  text: event.text,
                  startedAt: event.ts,
                });
              }
              textBlockOpen = true;
              onEvent({ type: 'text', text: event.text });
              break;
            }

            case 'thinking':
              // The platform emits a `thinking` event with `text: ''` at
              // each thinking-block start (see AnthropicAdapter handling of
              // content_block_start for type=thinking). Each empty-text
              // event marks a new block; record its timestamp so we can
              // pair it with the matching thinking_complete later, and
              // close any open text block so subsequent text doesn't merge
              // across the boundary.
              if (event.text === '') {
                thinkingBlockStartTimes.push(event.ts);
                textBlockOpen = false;
              }
              onEvent({ type: 'thinking', text: event.text });
              break;

            case 'thinking_complete': {
              const startedAt =
                thinkingBlockStartTimes[thinkingCompleteCount] ?? event.ts;
              contentBlocks.push({
                type: 'thinking',
                thinking: event.thinking,
                signature: event.signature,
                startedAt,
                completedAt: event.ts,
              });
              thinkingCompleteCount++;
              lastThinkingRelatedStartedAt = startedAt;
              break;
            }

            case 'redacted_thinking_complete': {
              // Anthropic emits redacted_thinking blocks at specific positions
              // among thinking/text/tool_use; the platform forwards them at
              // end-of-stream in original message-content order. We have no
              // streaming-time start event for these (no visible content to
              // delta through), so synthesize a startedAt that sorts just
              // after the most recent thinking-related block — preserves
              // relative order among thinking entries while still placing
              // them all before text/tool blocks.
              const startedAt =
                lastThinkingRelatedStartedAt !== undefined
                  ? lastThinkingRelatedStartedAt + 1
                  : event.ts;
              contentBlocks.push({
                type: 'redacted_thinking',
                data: event.data,
                startedAt,
                completedAt: event.ts,
              });
              lastThinkingRelatedStartedAt = startedAt;
              break;
            }

            case 'tool_input_delta': {
              // Anthropic: raw JSON string fragments
              const acc = getOrCreateAccumulator(event.id, event.name);
              acc.json += event.delta;
              try {
                const partial = parsePartialJson(acc.json);
                await handlePartialInput(acc, event.id, event.name, partial);
              } catch {
                // Not enough data to parse yet
              }
              break;
            }

            case 'tool_input_args': {
              // Gemini: accumulated partial object snapshot
              const acc = getOrCreateAccumulator(event.id, event.name);
              await handlePartialInput(acc, event.id, event.name, event.args);
              break;
            }

            case 'tool_use': {
              const tool = getToolByName(event.name);
              contentBlocks.push({
                type: 'tool',
                id: event.id,
                name: event.name,
                input: event.input,
                startedAt: event.ts,
                ...((event.input.background || tool?.backgroundOnly) && {
                  background: true,
                }),
              });
              const acc = toolInputAccumulators.get(event.id);
              const wasStreamed = acc?.started ?? false;
              const isInputStreaming = !!tool?.streaming?.partialInput;
              log.info('Tool received', {
                requestId,
                toolCallId: event.id,
                name: event.name,
              });
              // Emit tool_start if: not streamed yet, OR input-streaming
              // tool that needs a final non-partial emission.
              if (!wasStreamed || isInputStreaming) {
                onEvent({
                  type: 'tool_start',
                  id: event.id,
                  name: event.name,
                  input: event.input,
                  // Mirror the content-block stamp above so the live event
                  // matches what a history reload shows — without it the
                  // frontend renders background rows as already complete.
                  ...(isBackgroundCall({
                    name: event.name,
                    input: event.input,
                  }) && { background: true }),
                });
              }
              break;
            }

            case 'done':
              stopReason = event.stopReason;
              turnProviderMetadata = event.providerMetadata;
              turnModelId = event.modelId;
              turnLlmCalls++;
              lastCallInputTokens = event.usage.inputTokens;
              lastCallCacheCreation = event.usage.cacheCreationTokens ?? 0;
              lastCallCacheRead = event.usage.cacheReadTokens ?? 0;
              turnInputTokens += lastCallInputTokens;
              turnOutputTokens += event.usage.outputTokens;
              turnCacheCreation += lastCallCacheCreation;
              turnCacheRead += lastCallCacheRead;
              recordUsage({
                ts: Date.now(),
                requestId,
                agentName: 'parent',
                modelId: event.modelId,
                inputTokens: event.usage.inputTokens,
                outputTokens: event.usage.outputTokens,
                cacheCreationTokens: event.usage.cacheCreationTokens,
                cacheReadTokens: event.usage.cacheReadTokens,
                cost: nanoToDollars(event.cost),
                billingEvents: event.billingEvents,
                durationMs: Date.now() - iterStart,
                toolNames: contentBlocks
                  .filter(
                    (b): b is ContentBlock & { type: 'tool' } =>
                      b.type === 'tool',
                  )
                  .map((b) => b.name),
              });
              break;

            case 'error':
              // Stop before emitting so an in-flight tick can't land a status
              // label after the error (same reason as the turn_done path).
              statusWatcher.stop();
              // `friendlyError` rewrites the human-readable string; the machine
              // `code` (e.g. `insufficient_credits/balance`) passes through
              // untouched so the frontend can drive interactive recovery.
              onEvent({
                type: 'error',
                error: friendlyError(event.error),
                ...(event.code ? { code: event.code } : {}),
              });
              return;
          }
        }
      } catch (err: any) {
        if (signal?.aborted) {
          // Fetch abort throws — this is expected
        } else {
          throw err;
        }
      }

      if (signal?.aborted) {
        statusWatcher.stop();
        // Record whatever the assistant produced before cancellation
        if (contentBlocks.length > 0) {
          contentBlocks.push({
            type: 'text',
            text: '\n\n(cancelled)',
            startedAt: Date.now(),
          });
          state.messages.push({
            role: 'assistant',
            content: [...contentBlocks].sort(
              (a, b) => a.startedAt - b.startedAt,
            ),
            usage: {
              inputTokens: turnInputTokens,
              outputTokens: turnOutputTokens,
              cacheCreationTokens: turnCacheCreation || undefined,
              cacheReadTokens: turnCacheRead || undefined,
              llmCalls: turnLlmCalls,
            },
            ...(turnProviderMetadata && {
              providerMetadata: turnProviderMetadata,
            }),
            model: turnModelId ?? parentModel,
            ...(modelOverride && { modelOverride }),
          });
        }
        onEvent({ type: 'turn_cancelled' });
        saveSession(state);
        return;
      }

      // Record assistant message in conversation history (skip if empty)
      if (contentBlocks.length > 0) {
        state.messages.push({
          role: 'assistant',
          content: [...contentBlocks].sort((a, b) => a.startedAt - b.startedAt),
          usage: {
            inputTokens: turnInputTokens,
            outputTokens: turnOutputTokens,
            cacheCreationTokens: turnCacheCreation || undefined,
            cacheReadTokens: turnCacheRead || undefined,
            llmCalls: turnLlmCalls,
          },
          ...(turnProviderMetadata && {
            providerMetadata: turnProviderMetadata,
          }),
          model: turnModelId ?? parentModel,
          ...(modelOverride && { modelOverride }),
        });
      }

      // If no tool calls, the turn is complete
      const toolCalls = getToolCalls(contentBlocks);
      if (stopReason !== 'tool_use' || toolCalls.length === 0) {
        statusWatcher.stop();
        saveSession(state);
        onEvent({
          type: 'turn_done',
          stats: {
            inputTokens: turnInputTokens,
            outputTokens: turnOutputTokens,
            cacheCreationTokens: turnCacheCreation || undefined,
            cacheReadTokens: turnCacheRead || undefined,
            llmCalls: turnLlmCalls,
            lastCallInputTokens,
            lastCallCacheCreation: lastCallCacheCreation || undefined,
            lastCallCacheRead: lastCallCacheRead || undefined,
          },
        });
        return;
      }

      // Execute all tool calls in parallel (skip if cancelled)
      log.info('Tools executing', {
        requestId,
        count: toolCalls.length,
        tools: toolCalls.map((tc) => tc.name),
      });

      // Update status watcher context for tool execution phase
      currentToolNames = toolCalls
        .filter((tc) => !STATUS_EXCLUDED_TOOLS.has(tc.name))
        .map((tc) => tc.name)
        .join(', ');

      const wrappedOnEvent = (e: AgentEvent) => {
        // Capture sub-agent text for status watcher context
        if ('parentToolId' in e && e.parentToolId) {
          if (e.type === 'text') {
            subAgentText = e.text;
          } else if (e.type === 'tool_start') {
            subAgentText = `Using ${e.name}`;
          }
        }
        onEvent(e);
      };
      const subAgentMessages = new Map<string, import('./api.js').Message[]>();
      const results = await Promise.all(
        toolCalls.map(async (tc) => {
          if (signal?.aborted) {
            return { id: tc.id, result: USER_CANCELLED_RESULT, isError: true };
          }

          const toolStart = Date.now();

          // Controllable promise — can be settled externally by stop/restart
          let settle!: (result: string, isError: boolean) => void;
          const resultPromise = new Promise<{
            id: string;
            result: string;
            isError: boolean;
          }>((res) => {
            settle = (result, isError) => res({ id: tc.id, result, isError });
          });

          // Per-tool abort — cascades from parent turn signal
          let toolAbort = new AbortController();

          // Whether this slot has already been settled (prevent double-settle)
          let settled = false;
          const safeSettle = (result: string, isError: boolean) => {
            if (settled) {
              return;
            }
            settled = true;
            signal?.removeEventListener('abort', cascadeAbort);
            settle(result, isError);
          };

          const cascadeAbort = () => {
            toolAbort.abort();
            // Force-settle the tool so Promise.all doesn't hang
            safeSettle(USER_CANCELLED_RESULT, true);
          };
          signal?.addEventListener('abort', cascadeAbort, { once: true });

          // The execution function — can be called multiple times for restart
          const run = async (input: Record<string, any>) => {
            try {
              let result: string;
              if (EXTERNAL_TOOLS.has(tc.name) && resolveExternalTool) {
                saveSession(state);
                log.info('Waiting for external tool result', {
                  requestId,
                  toolCallId: tc.id,
                  name: tc.name,
                });
                const blocksUser = USER_BLOCKING_EXTERNAL_TOOLS.has(tc.name);
                if (blocksUser) {
                  statusWatcher.pause();
                }
                try {
                  result = await resolveExternalTool(tc.id, tc.name, input);
                } finally {
                  if (blocksUser) {
                    statusWatcher.resume();
                  }
                }
              } else {
                result = await executeTool(tc.name, input, {
                  apiConfig,
                  model,
                  models: state.models,
                  signal: toolAbort.signal,
                  onEvent: wrappedOnEvent,
                  resolveExternalTool,
                  toolCallId: tc.id,
                  requestId,
                  onboardingState,
                  subAgentMessages,
                  conversationMessages: state.messages,
                  toolRegistry,
                  onBackgroundComplete,
                  onLog: (line) =>
                    wrappedOnEvent({
                      type: 'tool_input_delta',
                      id: tc.id,
                      name: tc.name,
                      result: line,
                    }),
                });
              }
              safeSettle(capToolResult(result), result.startsWith('Error'));
            } catch (err: any) {
              safeSettle(`Error: ${err.message}`, true);
            }
          };

          // Register for lifecycle management
          const entry = {
            id: tc.id,
            name: tc.name,
            input: tc.input,
            abortController: toolAbort,
            startedAt: toolStart,
            settle: safeSettle,
            rerun: (newInput: Record<string, any>) => {
              // Reset for new execution
              settled = false;
              toolAbort = new AbortController();
              signal?.addEventListener('abort', () => toolAbort.abort(), {
                once: true,
              });
              entry.abortController = toolAbort;
              entry.input = newInput;
              run(newInput);
            },
          };
          toolRegistry?.register(entry);

          // Start execution
          run(tc.input);

          // Await result (transparent to stop/restart)
          const r = await resultPromise;
          // Background tools stay registered — the sub-agent runner manages
          // their lifecycle and unregisters on completion.
          if (!isBackgroundCall(tc)) {
            toolRegistry?.unregister(tc.id);
          }

          log.info('Tool completed', {
            requestId,
            toolCallId: tc.id,
            name: tc.name,
            durationMs: Date.now() - toolStart,
            isError: r.isError,
          });
          onEvent({
            type: 'tool_done',
            id: tc.id,
            name: tc.name,
            result: r.result,
            isError: r.isError,
          });
          if (!r.isError && BRAND_TRIGGERING_TOOLS.has(tc.name)) {
            triggerBrandExtraction(
              apiConfig,
              resolveModel('brandExtractor', state.models, model),
            );
          }
          return r;
        }),
      );

      // Attach results and sub-agent histories to tool content blocks
      for (const r of results) {
        const block = contentBlocks.find(
          (b) => b.type === 'tool' && b.id === r.id,
        );
        if (block?.type === 'tool') {
          block.result = r.result;
          block.isError = r.isError;
          block.completedAt = Date.now();
          const msgs = subAgentMessages.get(r.id);
          if (msgs) {
            block.subAgentMessages = msgs;
          }
        }
      }

      // Remember what tools just ran so the streaming watcher has context
      // while waiting for the model's first token in the next iteration.
      const lastNonExcluded = toolCalls.filter(
        (tc) => !STATUS_EXCLUDED_TOOLS.has(tc.name),
      );
      lastCompletedTools = lastNonExcluded.map((tc) => tc.name).join(', ');
      lastCompletedInput = JSON.stringify(lastNonExcluded.at(-1)?.input ?? {});
      lastCompletedResult = results.at(-1)?.result ?? '';

      // Append tool results as user messages (with toolCallId to link them).
      // This must happen even on cancellation — the assistant message already
      // has tool_use blocks, so the API requires matching tool_result messages.
      for (const r of results) {
        state.messages.push({
          role: 'user',
          content: r.result,
          toolCallId: r.id,
          isToolError: r.isError,
        });
      }

      // ASAP messages: pull any queued user messages promoted to mid-turn
      // delivery and inject them at this tool boundary as plain user messages —
      // the model reconciles them on its next call without the turn restarting.
      // Skipped once the turn is aborted so a cancelled turn never consumes
      // queue items.
      if (takeSteering && !signal?.aborted) {
        const injected = (await takeSteering()).filter(
          (e) => e.text.trim().length > 0 || (e.attachments?.length ?? 0) > 0,
        );
        if (injected.length > 0) {
          for (const entry of injected) {
            appendEntry(entry);
            // Keep the status watcher's turn context aware of the new request.
            keptEntries.push(entry);
          }
          // The items are already gone from the persisted queue; persist the
          // session immediately so a crash in between can't drop them.
          saveSession(state);
        }
      }

      if (signal?.aborted) {
        statusWatcher.stop();
        onEvent({ type: 'turn_cancelled' });
        saveSession(state);
        return;
      }

      // Loop back — the next iteration sends conversation with tool
      // results and the model continues from where it left off
    }
  } finally {
    // Last line of defense: no exit path — including a thrown streaming
    // error — may leave the interval alive.
    statusWatcher.stop();
  }
}
