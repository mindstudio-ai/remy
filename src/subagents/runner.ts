/**
 * Generic sub-agent runner.
 *
 * Runs a self-contained agent loop with its own system prompt, tools,
 * and message history. Events are tagged with `parentToolId` so the
 * frontend can render them nested under the parent tool call.
 *
 * Used by sub-agent tools (e.g., browser automation) that need their
 * own LLM loop with specialized tools.
 */

import { streamChat, type Message, type ToolDefinition } from '../api.js';
import { log } from '../logger.js';
import type { AgentEvent, ExternalToolResolver } from '../agent.js';

export interface SubAgentConfig {
  system: string;
  task: string;
  tools: ToolDefinition[];
  externalTools: Set<string>;
  executeTool: (name: string, input: Record<string, any>) => Promise<string>;
  apiConfig: { baseUrl: string; apiKey: string };
  model?: string;
  signal?: AbortSignal;
  parentToolId: string;
  onEvent: (event: AgentEvent) => void;
  resolveExternalTool?: ExternalToolResolver;
}

export async function runSubAgent(config: SubAgentConfig): Promise<string> {
  const {
    system,
    task,
    tools,
    externalTools,
    executeTool,
    apiConfig,
    model,
    signal,
    parentToolId,
    onEvent,
    resolveExternalTool,
  } = config;

  // Tag all events with the parent tool ID
  const emit = (e: AgentEvent) => {
    onEvent({ ...e, parentToolId } as AgentEvent);
  };

  const messages: Message[] = [{ role: 'user', content: task }];

  while (true) {
    if (signal?.aborted) {
      return 'Error: cancelled';
    }

    let assistantText = '';
    const toolCalls: Array<{
      id: string;
      name: string;
      input: Record<string, any>;
    }> = [];
    let stopReason = 'end_turn';

    try {
      for await (const event of streamChat({
        ...apiConfig,
        model,
        system,
        messages,
        tools,
        signal,
      })) {
        if (signal?.aborted) {
          break;
        }

        switch (event.type) {
          case 'text':
            assistantText += event.text;
            emit({ type: 'text', text: event.text });
            break;

          case 'thinking':
            emit({ type: 'thinking', text: event.text });
            break;

          case 'tool_use':
            toolCalls.push({
              id: event.id,
              name: event.name,
              input: event.input,
            });
            emit({
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
            return `Error: ${event.error}`;
        }
      }
    } catch (err: any) {
      if (!signal?.aborted) {
        throw err;
      }
    }

    if (signal?.aborted) {
      return 'Error: cancelled';
    }

    // Record assistant message
    messages.push({
      role: 'assistant',
      content: assistantText,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
    });

    // If no tool calls, we're done
    if (stopReason !== 'tool_use' || toolCalls.length === 0) {
      return assistantText;
    }

    // Execute tool calls
    log.info('Sub-agent executing tools', {
      parentToolId,
      count: toolCalls.length,
      tools: toolCalls.map((tc) => tc.name),
    });

    const results = await Promise.all(
      toolCalls.map(async (tc) => {
        if (signal?.aborted) {
          return { id: tc.id, result: 'Error: cancelled', isError: true };
        }
        try {
          let result: string;

          if (externalTools.has(tc.name) && resolveExternalTool) {
            result = await resolveExternalTool(tc.id, tc.name, tc.input);
          } else {
            result = await executeTool(tc.name, tc.input);
          }

          const isError = result.startsWith('Error');
          emit({
            type: 'tool_done',
            id: tc.id,
            name: tc.name,
            result,
            isError,
          });
          return { id: tc.id, result, isError };
        } catch (err: any) {
          const errorMsg = `Error: ${err.message}`;
          emit({
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

    // Append tool results
    for (const r of results) {
      messages.push({
        role: 'user',
        content: r.result,
        toolCallId: r.id,
        isToolError: r.isError,
      });
    }
  }
}
