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

import {
  streamChatWithRetry,
  type Message,
  type ContentBlock,
  type ToolDefinition,
} from '../api.js';
import { log } from '../logger.js';
import type { AgentEvent, ExternalToolResolver } from '../types.js';

export interface SubAgentConfig {
  system: string;
  task: string;
  tools: ToolDefinition[];
  externalTools: Set<string>;
  executeTool: (name: string, input: Record<string, any>) => Promise<string>;
  apiConfig: { baseUrl: string; apiKey: string };
  model?: string;
  subAgentId?: string;
  signal?: AbortSignal;
  parentToolId: string;
  onEvent: (event: AgentEvent) => void;
  resolveExternalTool?: ExternalToolResolver;
}

export interface SubAgentResult {
  text: string;
  messages: Message[];
}

export async function runSubAgent(
  config: SubAgentConfig,
): Promise<SubAgentResult> {
  const {
    system,
    task,
    tools,
    externalTools,
    executeTool,
    apiConfig,
    model,
    subAgentId,
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
      return { text: 'Error: cancelled', messages };
    }

    const contentBlocks: ContentBlock[] = [];
    let thinkingStartedAt = 0;
    let stopReason = 'end_turn';

    try {
      for await (const event of streamChatWithRetry({
        ...apiConfig,
        model,
        subAgentId,
        system,
        messages,
        tools,
        signal,
      })) {
        if (signal?.aborted) {
          break;
        }

        switch (event.type) {
          case 'text': {
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
            emit({ type: 'text', text: event.text });
            break;
          }

          case 'thinking':
            if (!thinkingStartedAt) {
              thinkingStartedAt = event.ts;
            }
            emit({ type: 'thinking', text: event.text });
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

          case 'tool_use':
            contentBlocks.push({
              type: 'tool',
              id: event.id,
              name: event.name,
              input: event.input,
              startedAt: Date.now(),
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
            return { text: `Error: ${event.error}`, messages };
        }
      }
    } catch (err: any) {
      if (!signal?.aborted) {
        throw err;
      }
    }

    if (signal?.aborted) {
      return { text: 'Error: cancelled', messages };
    }

    // Record assistant message
    messages.push({
      role: 'assistant',
      content: contentBlocks,
    });

    // Extract tool calls from content blocks
    const toolCalls = contentBlocks.filter(
      (b): b is ContentBlock & { type: 'tool' } => b.type === 'tool',
    );

    // If no tool calls, we're done
    if (stopReason !== 'tool_use' || toolCalls.length === 0) {
      const text = contentBlocks
        .filter((b): b is ContentBlock & { type: 'text' } => b.type === 'text')
        .map((b) => b.text)
        .join('');
      return { text, messages };
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
