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
  streamChat,
  type Message,
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

// Tools where the result comes from outside (sandbox/user), not local execution.
const EXTERNAL_TOOLS = new Set([
  'promptUser',
  'setViewMode',
  'clearSyncStatus',
  'presentSyncPlan',
]);

// Events emitted to the UI layer
export type AgentEvent =
  | { type: 'text'; text: string }
  | { type: 'thinking'; text: string }
  | { type: 'tool_input_delta'; id: string; name: string; result: string }
  | {
      type: 'tool_start';
      id: string;
      name: string;
      input: Record<string, any>;
      partial?: boolean;
    }
  | {
      type: 'tool_done';
      id: string;
      name: string;
      result: string;
      isError: boolean;
    }
  | { type: 'turn_started' }
  | { type: 'turn_done' }
  | { type: 'turn_cancelled' }
  | { type: 'error'; error: string };

// Conversation state persisted across turns
export interface AgentState {
  messages: Message[];
}

export function createAgentState(): AgentState {
  return { messages: [] };
}

/**
 * Callback for resolving external tool results. The agent emits
 * tool_start, then calls this function which returns a promise that
 * resolves when the external system (sandbox) provides the result.
 *
 * If not provided, external tools fall back to local execution.
 */
export type ExternalToolResolver = (
  id: string,
  name: string,
  input: Record<string, any>,
) => Promise<string>;

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
  projectHasCode: boolean;
  signal?: AbortSignal;
  onEvent: (event: AgentEvent) => void;
  resolveExternalTool?: ExternalToolResolver;
  hidden?: boolean;
  extraTools?: import('./tools/index.js').Tool[];
}): Promise<void> {
  const {
    state,
    userMessage,
    attachments,
    apiConfig,
    system,
    model,
    projectHasCode,
    signal,
    onEvent,
    resolveExternalTool,
    hidden,
    extraTools,
  } = params;
  const tools = [
    ...getToolDefinitions(projectHasCode),
    ...(extraTools ?? []).map((t) => t.definition),
  ];

  // Build a local tool lookup that includes extra tools
  const lookupTool = (name: string) =>
    (extraTools ?? []).find((t) => t.definition.name === name) ??
    getToolByName(name);

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

  // Add user message to conversation
  const userMsg: Message = { role: 'user', content: userMessage };
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
  while (true) {
    if (signal?.aborted) {
      onEvent({ type: 'turn_cancelled' });
      saveSession(state);
      return;
    }

    let assistantText = '';
    const toolCalls: Array<{
      id: string;
      name: string;
      input: Record<string, any>;
    }> = [];
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
      const tool = lookupTool(name);
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
    try {
      for await (const event of streamChat({
        ...apiConfig,
        model,
        system,
        messages: state.messages,
        tools,
        signal,
      })) {
        if (signal?.aborted) {
          break;
        }

        switch (event.type) {
          case 'text':
            assistantText += event.text;
            onEvent({ type: 'text', text: event.text });
            break;

          case 'thinking':
            onEvent({ type: 'thinking', text: event.text });
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
            toolCalls.push({
              id: event.id,
              name: event.name,
              input: event.input,
            });
            const acc = toolInputAccumulators.get(event.id);
            const tool = lookupTool(event.name);
            const wasStreamed = acc?.started ?? false;
            const isInputStreaming = !!tool?.streaming?.partialInput;
            log.debug('Received tool_use', {
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
            onEvent({ type: 'error', error: event.error });
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
      // Record whatever the assistant produced before cancellation
      if (assistantText) {
        state.messages.push({
          role: 'assistant',
          content: assistantText + '\n\n(cancelled)',
          toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
        });
      }
      onEvent({ type: 'turn_cancelled' });
      saveSession(state);
      return;
    }

    // Record assistant message in conversation history
    state.messages.push({
      role: 'assistant',
      content: assistantText,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
    });

    // If no tool calls, the turn is complete
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
            log.debug('Waiting for external tool result', {
              name: tc.name,
              id: tc.id,
            });
            result = await resolveExternalTool(tc.id, tc.name, tc.input);
          } else {
            // Local tool — execute directly
            result = await executeTool(tc.name, tc.input);
          }

          const isError = result.startsWith('Error');
          log.debug('Tool completed', {
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

    if (signal?.aborted) {
      onEvent({ type: 'turn_cancelled' });
      saveSession(state);
      return;
    }

    // Append tool results as user messages (with toolCallId to link them)
    for (const r of results) {
      state.messages.push({
        role: 'user',
        content: r.result,
        toolCallId: r.id,
        isToolError: r.isError,
      });
    }

    // Loop back — the next iteration sends conversation with tool
    // results and the model continues from where it left off
  }
}
