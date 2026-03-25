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
import type { ToolRegistry } from '../toolRegistry.js';
import { startStatusWatcher } from '../statusWatcher.js';
import { cleanMessagesForApi } from './common/cleanMessages.js';

export interface SubAgentConfig {
  system: string;
  task: string;
  tools: ToolDefinition[];
  externalTools: Set<string>;
  executeTool: (
    name: string,
    input: Record<string, any>,
    toolCallId?: string,
    onLog?: (line: string) => void,
  ) => Promise<string>;
  apiConfig: { baseUrl: string; apiKey: string };
  model?: string;
  subAgentId?: string;
  signal?: AbortSignal;
  parentToolId: string;
  onEvent: (event: AgentEvent) => void;
  resolveExternalTool?: ExternalToolResolver;
  toolRegistry?: ToolRegistry;
  /** Run in background — return initial response immediately, continue working. */
  background?: boolean;
  /** Called when a backgrounded sub-agent finishes all its work. */
  onBackgroundComplete?: (result: SubAgentResult) => void;
}

export interface SubAgentResult {
  text: string;
  messages: Message[];
  /** True if the sub-agent is still running in the background. */
  backgrounded?: boolean;
}

export function runSubAgent(config: SubAgentConfig): Promise<SubAgentResult> {
  const {
    system,
    task,
    tools,
    externalTools,
    executeTool,
    apiConfig,
    model,
    subAgentId,
    signal: parentSignal,
    parentToolId,
    onEvent,
    resolveExternalTool,
    toolRegistry,
    background,
    onBackgroundComplete,
  } = config;

  // For background mode, create our own AbortController so we outlive the parent turn.
  // For foreground, use the parent signal directly.
  const bgAbort = background ? new AbortController() : null;
  const signal: AbortSignal | undefined = background
    ? bgAbort!.signal
    : parentSignal;

  // Tag all events with the parent tool ID
  const emit = (e: AgentEvent) => {
    onEvent({ ...e, parentToolId } as AgentEvent);
  };

  // Background split state
  let splitDone = false;
  let earlyResolve: ((result: SubAgentResult) => void) | null = null;

  // The core loop — runs to completion in foreground, or detached in background
  const run = async (): Promise<SubAgentResult> => {
    const messages: Message[] = [{ role: 'user', content: task }];

    /** Collect accumulated text from content blocks for graceful interruption. */
    function getPartialText(blocks: ContentBlock[]): string {
      return blocks
        .filter((b): b is ContentBlock & { type: 'text' } => b.type === 'text')
        .map((b) => b.text)
        .join('');
    }

    function abortResult(blocks: ContentBlock[]): SubAgentResult {
      if (signal?.reason === 'graceful') {
        const partial = getPartialText(blocks);
        return {
          text: partial
            ? `[INTERRUPTED]\n\n${partial}`
            : '[INTERRUPTED] Sub-agent was interrupted before producing output.',
          messages,
        };
      }
      return { text: 'Error: cancelled', messages };
    }

    let lastToolResult = '';

    while (true) {
      if (signal?.aborted) {
        return abortResult([]);
      }

      const contentBlocks: ContentBlock[] = [];
      let thinkingStartedAt = 0;
      let stopReason = 'end_turn';
      let currentToolNames = '';

      const statusWatcher = startStatusWatcher({
        apiConfig,
        getContext: () => ({
          assistantText: getPartialText(contentBlocks),
          lastToolName: currentToolNames || undefined,
          lastToolResult: lastToolResult || undefined,
        }),
        onStatus: (label) => emit({ type: 'status', message: label }),
        signal,
      });

      const fullSystem = `${system}\n\nCurrent date/time: ${new Date()
        .toISOString()
        .replace('T', ' ')
        .replace(/\.\d+Z$/, ' UTC')}`;

      try {
        for await (const event of streamChatWithRetry(
          {
            ...apiConfig,
            model,
            subAgentId,
            system: fullSystem,
            messages: cleanMessagesForApi(messages),
            tools,
            signal,
          },
          {
            onRetry: (attempt) =>
              emit({
                type: 'status',
                message: `Lost connection, retrying (attempt ${attempt + 2} of 3)...`,
              }),
          },
        )) {
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
        statusWatcher.stop();
        return abortResult(contentBlocks);
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
        statusWatcher.stop();
        const text = getPartialText(contentBlocks);
        if (splitDone) {
          // Background mode: this is the final completion
          onBackgroundComplete?.({ text, messages });
          return { text, messages }; // Only reached if running detached
        }
        return { text, messages };
      }

      // Background split: return initial response, continue working in background
      if (background && !splitDone) {
        const text = getPartialText(contentBlocks);
        if (text && earlyResolve) {
          splitDone = true;
          earlyResolve({ text, messages: [...messages], backgrounded: true });
        }
      }

      // Execute tool calls
      log.info('Sub-agent executing tools', {
        parentToolId,
        count: toolCalls.length,
        tools: toolCalls.map((tc) => tc.name),
      });
      currentToolNames = toolCalls.map((tc) => tc.name).join(', ');

      const results = await Promise.all(
        toolCalls.map(async (tc) => {
          if (signal?.aborted) {
            return { id: tc.id, result: 'Error: cancelled', isError: true };
          }

          // Per-tool controllable promise + abort
          let settle!: (result: string, isError: boolean) => void;
          const resultPromise = new Promise<{
            id: string;
            result: string;
            isError: boolean;
          }>((res) => {
            settle = (result, isError) => res({ id: tc.id, result, isError });
          });

          let toolAbort = new AbortController();
          const cascadeAbort = () => toolAbort.abort();
          signal?.addEventListener('abort', cascadeAbort, { once: true });

          let settled = false;
          const safeSettle = (result: string, isError: boolean) => {
            if (settled) {
              return;
            }
            settled = true;
            signal?.removeEventListener('abort', cascadeAbort);
            settle(result, isError);
          };

          const run = async (input: Record<string, any>) => {
            try {
              let result: string;
              if (externalTools.has(tc.name) && resolveExternalTool) {
                result = await resolveExternalTool(tc.id, tc.name, input);
              } else {
                const onLog = (line: string) =>
                  emit({
                    type: 'tool_input_delta',
                    id: tc.id,
                    name: tc.name,
                    result: line,
                  });
                result = await executeTool(tc.name, input, tc.id, onLog);
              }
              safeSettle(result, result.startsWith('Error'));
            } catch (err: any) {
              safeSettle(`Error: ${err.message}`, true);
            }
          };

          // Register for lifecycle management
          const entry = {
            id: tc.id,
            name: tc.name,
            input: tc.input,
            parentToolId,
            abortController: toolAbort,
            startedAt: Date.now(),
            settle: safeSettle,
            rerun: (newInput: Record<string, any>) => {
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

          run(tc.input);

          const r = await resultPromise;
          toolRegistry?.unregister(tc.id);

          emit({
            type: 'tool_done',
            id: tc.id,
            name: tc.name,
            result: r.result,
            isError: r.isError,
          });
          return r;
        }),
      );

      statusWatcher.stop();
      lastToolResult = results.at(-1)?.result ?? '';

      // Merge results onto the tool content blocks (so sub-agent messages
      // are self-contained — the frontend can read result directly from
      // the tool block without cross-referencing user messages).
      for (const r of results) {
        const block = contentBlocks.find(
          (b) => b.type === 'tool' && b.id === r.id,
        );
        if (block?.type === 'tool') {
          block.result = r.result;
          block.isError = r.isError;
          block.completedAt = Date.now();
        }

        // Still append as user messages — the LLM needs them for the next loop iteration
        messages.push({
          role: 'user',
          content: r.result,
          toolCallId: r.id,
          isToolError: r.isError,
        });
      }
    }
  };

  // Foreground: just run and return
  if (!background) {
    return run();
  }

  // Background: return a promise that resolves early when the sub-agent
  // produces its first text response. The loop continues detached.
  return new Promise<SubAgentResult>((resolve) => {
    earlyResolve = resolve;

    // Run detached — don't await. Errors are caught inside run().
    run()
      .then((finalResult) => {
        if (!splitDone) {
          // Never split — the sub-agent finished before producing text + tool calls.
          // Return normally (not backgrounded).
          resolve(finalResult);
        } else {
          // Background completion — deliver via callback
          onBackgroundComplete?.(finalResult);
        }
      })
      .catch((err) => {
        if (!splitDone) {
          resolve({ text: `Error: ${err.message}`, messages: [] });
        } else {
          onBackgroundComplete?.({
            text: `Error: ${err.message}`,
            messages: [],
          });
        }
      });
  });
}
