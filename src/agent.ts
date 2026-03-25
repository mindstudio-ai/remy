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
import { log } from './logger.js';
import { parsePartialJson } from './parsePartialJson.js';
import { startStatusWatcher } from './statusWatcher.js';
import { friendlyError } from './errors.js';

import { cleanMessagesForApi } from './subagents/common/cleanMessages.js';

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
  'clearSyncStatus',
  'presentSyncPlan',
  'presentPublishPlan',
  'presentPlan',
  'confirmDestructiveAction',
  'runScenario',
  'runMethod',
  'browserCommand',
  'setProjectName',
]);

export type { AgentEvent, AgentState, ExternalToolResolver } from './types.js';
import type { AgentEvent, AgentState, ExternalToolResolver } from './types.js';

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
  userMessage: string;
  attachments?: Attachment[];
  apiConfig: { baseUrl: string; apiKey: string };
  system: string;
  model?: string;
  onboardingState: string;
  signal?: AbortSignal;
  onEvent: (event: AgentEvent) => void;
  resolveExternalTool?: ExternalToolResolver;
  hidden?: boolean;
}): Promise<void> {
  const {
    state,
    userMessage,
    attachments,
    apiConfig,
    system,
    model,
    onboardingState,
    signal,
    onEvent,
    resolveExternalTool,
    hidden,
  } = params;
  const tools = getToolDefinitions(onboardingState);

  log.info('Turn started', {
    messageLength: userMessage.length,
    toolCount: tools.length,
    tools: tools.map((t) => t.name),
    ...(attachments &&
      attachments.length > 0 && {
        attachmentCount: attachments.length,
        attachmentUrls: attachments.map((a) => a.url),
      }),
  });

  onEvent({ type: 'turn_started' });

  // Strip @@automated::...@@ sentinel prefix before sending to the LLM.
  // The frontend uses this to mark automated messages for custom rendering,
  // but the agent should see them as normal user messages.
  const cleanMessage = userMessage.replace(/^@@automated::[^@]*@@/, '');

  // Add user message to conversation
  const userMsg: Message = { role: 'user', content: cleanMessage };
  if (hidden) {
    userMsg.hidden = true;
  }
  if (attachments && attachments.length > 0) {
    userMsg.attachments = attachments;
    log.debug('Attachments added to user message', {
      count: attachments.length,
      urls: attachments.map((a) => a.url),
    });
  }
  state.messages.push(userMsg);

  // Tool-call loop: keep going until the model stops requesting tools
  // Internal tools that are invisible to the user — exclude from status labels
  const STATUS_EXCLUDED_TOOLS = new Set([
    'setProjectOnboardingState',
    'setProjectName',
    'clearSyncStatus',
    'editsFinished',
  ]);

  // Track last tool context across loop iterations so the status watcher
  // has something to report while waiting for the model's first token.
  let lastCompletedTools = '';
  let lastCompletedResult = '';

  while (true) {
    if (signal?.aborted) {
      onEvent({ type: 'turn_cancelled' });
      saveSession(state);
      return;
    }

    const contentBlocks: ContentBlock[] = [];
    let thinkingStartedAt = 0;
    const toolInputAccumulators = new Map<string, ToolInputAcc>();
    let stopReason = 'end_turn';

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
        log.debug('Streaming partial tool_start', {
          id,
          name,
          emittedCount: result.emittedCount,
        });
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
        log.debug('Streaming content tool: emitting early tool_start', {
          id,
          name,
        });
        onEvent({ type: 'tool_start', id, name, input: partial });
      }

      if (transform) {
        const result = await transform(partial);
        if (result === null) {
          return;
        }
        log.debug('Streaming content tool: emitting tool_input_delta', {
          id,
          name,
          resultLength: result.length,
        });
        onEvent({ type: 'tool_input_delta', id, name, result });
      } else {
        log.debug('Streaming content tool: emitting tool_input_delta', {
          id,
          name,
          contentLength: content.length,
        });
        onEvent({ type: 'tool_input_delta', id, name, result: content });
      }
    }

    // Stream one LLM turn
    const statusWatcher = startStatusWatcher({
      apiConfig,
      getContext: () => ({
        assistantText: getTextContent(contentBlocks).slice(-500),
        lastToolName:
          getToolCalls(contentBlocks)
            .filter((tc) => !STATUS_EXCLUDED_TOOLS.has(tc.name))
            .at(-1)?.name ||
          lastCompletedTools ||
          undefined,
        lastToolResult: lastCompletedResult || undefined,
        onboardingState,
        userMessage,
      }),
      onStatus: (label) => onEvent({ type: 'status', message: label }),
      signal,
    });

    try {
      for await (const event of streamChatWithRetry(
        {
          ...apiConfig,
          model,
          system,
          messages: cleanMessagesForApi(state.messages),
          tools,
          signal,
        },
        {
          onRetry: (attempt) => {
            onEvent({
              type: 'status',
              message: `Lost connection, retrying (attempt ${attempt + 2} of 3)...`,
            });
          },
        },
      )) {
        if (signal?.aborted) {
          break;
        }

        switch (event.type) {
          case 'text': {
            // Append to last text block if it exists, else push new one
            const lastBlock = contentBlocks.at(-1);
            if (lastBlock?.type === 'text') {
              lastBlock.text += event.text;
            } else {
              contentBlocks.push({
                type: 'text',
                text: event.text,
                startedAt: event.ts,
              });
            }
            onEvent({ type: 'text', text: event.text });
            break;
          }

          case 'thinking':
            if (!thinkingStartedAt) {
              thinkingStartedAt = event.ts;
            }
            onEvent({ type: 'thinking', text: event.text });
            break;

          case 'thinking_complete':
            contentBlocks.push({
              type: 'thinking',
              thinking: event.thinking,
              signature: event.signature,
              startedAt: thinkingStartedAt,
              completedAt: event.ts,
            });
            thinkingStartedAt = 0;
            break;

          case 'tool_input_delta': {
            // Anthropic: raw JSON string fragments
            const acc = getOrCreateAccumulator(event.id, event.name);
            acc.json += event.delta;
            log.debug('Received tool_input_delta', {
              id: event.id,
              name: event.name,
              deltaLength: event.delta.length,
              accumulatedLength: acc.json.length,
            });

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
            log.debug('Received tool_input_args', {
              id: event.id,
              name: event.name,
              keys: Object.keys(event.args),
            });

            await handlePartialInput(acc, event.id, event.name, event.args);
            break;
          }

          case 'tool_use': {
            contentBlocks.push({
              type: 'tool',
              id: event.id,
              name: event.name,
              input: event.input,
              startedAt: event.ts,
            });
            const acc = toolInputAccumulators.get(event.id);
            const tool = getToolByName(event.name);
            const wasStreamed = acc?.started ?? false;
            const isInputStreaming = !!tool?.streaming?.partialInput;
            log.info('Tool call received', {
              id: event.id,
              name: event.name,
              wasStreamed,
              isInputStreaming,
            });
            // Emit tool_start if: not streamed yet, OR input-streaming
            // tool that needs a final non-partial emission.
            if (!wasStreamed || isInputStreaming) {
              onEvent({
                type: 'tool_start',
                id: event.id,
                name: event.name,
                input: event.input,
              });
            }
            break;
          }

          case 'done':
            stopReason = event.stopReason;
            break;

          case 'error':
            onEvent({ type: 'error', error: friendlyError(event.error) });
            return;
        }
      }
    } catch (err: any) {
      if (signal?.aborted) {
        // Fetch abort throws — this is expected
      } else {
        throw err;
      }
    } finally {
      statusWatcher.stop();
    }

    if (signal?.aborted) {
      // Record whatever the assistant produced before cancellation
      if (contentBlocks.length > 0) {
        contentBlocks.push({
          type: 'text',
          text: '\n\n(cancelled)',
          startedAt: Date.now(),
        });
        state.messages.push({
          role: 'assistant',
          content: [...contentBlocks].sort((a, b) => a.startedAt - b.startedAt),
        });
      }
      onEvent({ type: 'turn_cancelled' });
      saveSession(state);
      return;
    }

    // Record assistant message in conversation history
    state.messages.push({
      role: 'assistant',
      content: [...contentBlocks].sort((a, b) => a.startedAt - b.startedAt),
    });

    // If no tool calls, the turn is complete
    const toolCalls = getToolCalls(contentBlocks);
    if (stopReason !== 'tool_use' || toolCalls.length === 0) {
      saveSession(state);
      onEvent({ type: 'turn_done' });
      return;
    }

    // Execute all tool calls in parallel (skip if cancelled)
    log.info('Executing tools', {
      count: toolCalls.length,
      tools: toolCalls.map((tc) => tc.name),
    });
    // Track sub-agent activity for status labels
    let subAgentText = '';
    const origOnEvent = onEvent;
    const wrappedOnEvent = (e: AgentEvent) => {
      // Capture sub-agent text for status watcher context
      if ('parentToolId' in e && e.parentToolId) {
        if (e.type === 'text') {
          subAgentText = e.text;
        } else if (e.type === 'tool_start') {
          subAgentText = `Using ${e.name}`;
        }
      }
      origOnEvent(e);
    };

    const toolStatusWatcher = startStatusWatcher({
      apiConfig,
      getContext: () => ({
        assistantText:
          subAgentText || getTextContent(contentBlocks).slice(-500),
        lastToolName:
          toolCalls
            .filter((tc) => !STATUS_EXCLUDED_TOOLS.has(tc.name))
            .map((tc) => tc.name)
            .join(', ') || undefined,
        lastToolResult: lastCompletedResult || undefined,
        onboardingState,
        userMessage,
      }),
      onStatus: (label) => origOnEvent({ type: 'status', message: label }),
      signal,
    });
    const subAgentMessages = new Map<string, import('./api.js').Message[]>();
    const results = await Promise.all(
      toolCalls.map(async (tc) => {
        if (signal?.aborted) {
          return {
            id: tc.id,
            result: 'Error: cancelled',
            isError: true,
          };
        }
        const toolStart = Date.now();
        try {
          let result: string;

          if (EXTERNAL_TOOLS.has(tc.name) && resolveExternalTool) {
            // External tool — save before blocking on user/sandbox response
            saveSession(state);
            log.info('Waiting for external tool result', {
              name: tc.name,
              id: tc.id,
            });
            result = await resolveExternalTool(tc.id, tc.name, tc.input);
          } else {
            // Local tool — execute directly
            result = await executeTool(tc.name, tc.input, {
              apiConfig,
              model,
              signal,
              onEvent: wrappedOnEvent,
              resolveExternalTool,
              toolCallId: tc.id,
              subAgentMessages,
              onLog: (line) =>
                wrappedOnEvent({
                  type: 'tool_input_delta',
                  id: tc.id,
                  name: tc.name,
                  result: line,
                }),
            });
          }

          const isError = result.startsWith('Error');
          log.info('Tool completed', {
            name: tc.name,
            elapsed: `${Date.now() - toolStart}ms`,
            isError,
            resultLength: result.length,
          });
          onEvent({
            type: 'tool_done',
            id: tc.id,
            name: tc.name,
            result,
            isError,
          });
          return { id: tc.id, result, isError };
        } catch (err: any) {
          const errorMsg = `Error: ${err.message}`;
          onEvent({
            type: 'tool_done',
            id: tc.id,
            name: tc.name,
            result: errorMsg,
            isError: true,
          });
          return { id: tc.id, result: errorMsg, isError: true };
        }
      }),
    );

    toolStatusWatcher.stop();

    // Attach results and sub-agent histories to tool content blocks
    for (const r of results) {
      const block = contentBlocks.find(
        (b) => b.type === 'tool' && b.id === r.id,
      );
      if (block?.type === 'tool') {
        block.result = r.result;
        block.isError = r.isError;
        const msgs = subAgentMessages.get(r.id);
        if (msgs) {
          block.subAgentMessages = msgs;
        }
      }
    }

    // Remember what tools just ran so the streaming watcher has context
    // while waiting for the model's first token in the next iteration.
    lastCompletedTools = toolCalls
      .filter((tc) => !STATUS_EXCLUDED_TOOLS.has(tc.name))
      .map((tc) => tc.name)
      .join(', ');
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

    if (signal?.aborted) {
      onEvent({ type: 'turn_cancelled' });
      saveSession(state);
      return;
    }

    // Loop back — the next iteration sends conversation with tool
    // results and the model continues from where it left off
  }
}
