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
import { executeTool, getToolDefinitions } from './tools/index.js';
import { saveSession } from './session.js';
import { log } from './logger.js';

// Tools where the result comes from outside (sandbox/user), not local execution.
const EXTERNAL_TOOLS = new Set(['promptUser', 'setViewMode']);

// Events emitted to the UI layer
export type AgentEvent =
  | { type: 'text'; text: string }
  | { type: 'thinking'; text: string }
  | { type: 'tool_start'; id: string; name: string; input: Record<string, any> }
  | {
      type: 'tool_done';
      id: string;
      name: string;
      result: string;
      isError: boolean;
    }
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
  } = params;
  const tools = getToolDefinitions(projectHasCode);

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

  // Add user message to conversation
  const userMsg: Message = { role: 'user', content: userMessage };
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
    let stopReason = 'end_turn';

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

          case 'tool_use':
            toolCalls.push({
              id: event.id,
              name: event.name,
              input: event.input,
            });
            onEvent({
              type: 'tool_start',
              id: event.id,
              name: event.name,
              input: event.input,
            });
            break;

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
            // External tool — wait for the sandbox/user to provide the result
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
