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
  generateBackgroundAck,
  type Message,
  type ContentBlock,
  type ToolDefinition,
} from '../api.js';
import { createLogger } from '../logger.js';

const log = createLogger('sub-agent');
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
  /** Correlation ID from the headless protocol — threaded for structured logging. */
  requestId?: string;
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
    signal: parentSignal,
    parentToolId,
    onEvent,
    resolveExternalTool,
    toolRegistry,
    requestId,
    background,
    onBackgroundComplete,
  } = config;

  // For background mode, create our own AbortController so we outlive the parent turn.
  // For foreground, use the parent signal directly.
  const bgAbort = background ? new AbortController() : null;
  const signal: AbortSignal | undefined = background
    ? bgAbort!.signal
    : parentSignal;

  const agentName = subAgentId || 'sub-agent';
  const runStart = Date.now();
  log.info('Sub-agent started', { requestId, parentToolId, agentName });

  // Tag all events with the parent tool ID
  const emit = (e: AgentEvent) => {
    onEvent({ ...e, parentToolId } as AgentEvent);
  };

  // The core loop
  let turns = 0;
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
            ? `[INTERRUPTED - PARTIAL OUTPUT RETRIEVED] Note that partial output may include thinking text or other unfinalized decisions. It is NOT an authoritative response from this agent.\n\n${partial}`
            : '[INTERRUPTED] Agent was interrupted before producing output.',
          messages,
        };
      }
      return { text: 'Error: cancelled', messages };
    }

    let lastToolResult = '';

    while (true) {
      turns++;
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
            requestId,
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
        return { text, messages };
      }

      // Execute tool calls
      log.info('Tools executing', {
        requestId,
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

  const wrapRun = async (): Promise<SubAgentResult> => {
    try {
      const result = await run();
      log.info('Sub-agent complete', {
        requestId,
        parentToolId,
        agentName,
        durationMs: Date.now() - runStart,
        turns,
      });
      return result;
    } catch (err: any) {
      log.warn('Sub-agent error', {
        requestId,
        parentToolId,
        agentName,
        error: err.message,
      });
      throw err;
    }
  };

  // Foreground: just run and return
  if (!background) {
    return wrapRun();
  }

  log.info('Sub-agent backgrounded', { requestId, parentToolId, agentName });

  // Register the background agent in the tool registry so it can be stopped.
  // Uses the parentToolId (the tool call ID visible to the user) and the
  // background-specific AbortController so stop_tool actually cancels the work.
  toolRegistry?.register({
    id: parentToolId,
    name: agentName,
    input: { task },
    abortController: bgAbort!,
    startedAt: Date.now(),
    settle: () => {},
    rerun: () => {},
    getPartialResult: () => '',
  });

  // Background: generate a friendly ack, run the loop detached.
  const ack = await generateBackgroundAck({
    apiConfig,
    agentName: subAgentId || 'agent',
    task,
  });

  // Run detached — deliver result via callback when done.
  wrapRun()
    .then((finalResult) => {
      toolRegistry?.unregister(parentToolId);
      onBackgroundComplete?.(finalResult);
    })
    .catch((err) => {
      toolRegistry?.unregister(parentToolId);
      onBackgroundComplete?.({ text: `Error: ${err.message}`, messages: [] });
    });

  return { text: ack, messages: [], backgrounded: true };
}
