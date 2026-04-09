/**
 * SSE client for the agent chat endpoint.
 *
 * Makes POST requests to /_internal/v2/agent/remy/chat and parses the
 * Server-Sent Events response stream into typed events. Returns an
 * async generator so the caller can process events as they arrive.
 *
 * The endpoint is vendor-agnostic — the platform handles model routing,
 * billing, and translating between our normalized format and the
 * provider's API (Anthropic, OpenAI, Gemini, etc.).
 */

import { createLogger } from './logger.js';

const log = createLogger('api');

// Normalized message format — matches the platform's ChatMessage type.
// The platform translates to/from provider-specific formats.
export interface Attachment {
  url: string;
  extractedTextUrl?: string;
  /** Voice message transcript (speech-to-text output). */
  transcript?: string;
  /** Voice message duration in milliseconds. */
  durationMs?: number;
  /** Whether this attachment is a voice message. */
  isVoice?: boolean;
}

// Typed content blocks for assistant messages — preserves ordering of
// thinking, text, and tool calls as they occurred in the stream.
export type ContentBlock =
  | {
      type: 'thinking';
      thinking: string;
      signature: string;
      startedAt: number;
      completedAt: number;
    }
  | { type: 'text'; text: string; startedAt: number }
  | {
      type: 'tool';
      id: string;
      name: string;
      input: Record<string, any>;
      startedAt: number;
      completedAt?: number;
      result?: string;
      isError?: boolean;
      subAgentMessages?: Message[];
      /** Whether this tool is running in background mode. */
      background?: boolean;
      /** Final result from a backgrounded sub-agent (set when background work completes). */
      backgroundResult?: string;
    }
  | {
      type: 'summary';
      /** What this summary covers: 'conversation' or a subagent name (e.g. 'visualDesignExpert'). */
      name: string;
      text: string;
      startedAt: number;
    };

export interface Message {
  role: 'system' | 'user' | 'assistant';
  // User/system messages: string. Assistant messages: ContentBlock[].
  content: string | ContentBlock[];
  // User messages with toolCallId are tool results (not human messages)
  toolCallId?: string;
  isToolError?: boolean;
  // User messages may include file attachments
  attachments?: Attachment[];
  // Hidden messages are sent to the LLM but not shown in the UI
  hidden?: boolean;
}

// Tool definition sent to the LLM — vendor-agnostic JSON Schema format
export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, any>;
  /** Whether results from this tool can be cleared from old turns to save context. */
  clearable?: boolean;
}

// Events yielded by the SSE stream. All events include an optional `ts`
// timestamp from the platform (milliseconds). Falls back to Date.now() if absent.
export type StreamEvent =
  | { type: 'text'; text: string; ts: number }
  | { type: 'thinking'; text: string; ts: number }
  | {
      type: 'thinking_complete';
      thinking: string;
      signature: string;
      ts: number;
    }
  | {
      type: 'tool_input_delta';
      id: string;
      name: string;
      delta: string;
      ts: number;
    }
  | {
      type: 'tool_input_args';
      id: string;
      name: string;
      args: Record<string, any>;
      ts: number;
    }
  | {
      type: 'tool_use';
      id: string;
      name: string;
      input: Record<string, any>;
      ts: number;
    }
  | {
      type: 'done';
      stopReason: string;
      usage: {
        inputTokens: number;
        outputTokens: number;
        cacheCreationTokens?: number;
        cacheReadTokens?: number;
      };
      ts: number;
    }
  | { type: 'error'; error: string };

/**
 * Stream a single LLM turn via the platform's agent chat endpoint.
 *
 * Yields events as they arrive: text chunks, thinking blocks, tool_use
 * requests, and a final done/error event. The caller (agent loop) decides
 * what to do with tool_use events (execute tools, send results back).
 */
export async function* streamChat(params: {
  baseUrl: string;
  apiKey: string;
  model?: string;
  system: string;
  messages: Message[];
  tools: ToolDefinition[];
  maxTokens?: number;
  temperature?: number;
  config?: Record<string, any>;
  /** Tool names whose results should NOT be cleared by server-side context management. */
  excludeToolsFromClearing?: string[];
  subAgentId?: string;
  requestId?: string;
  signal?: AbortSignal;
}): AsyncGenerator<StreamEvent> {
  const { baseUrl, apiKey, signal, requestId, ...body } = params;
  const url = `${baseUrl}/_internal/v2/agent/remy/chat`;
  const startTime = Date.now();
  // subAgentId is in body (sent to API) — extract for logging
  const subAgentId = body.subAgentId;

  log.info('API request', {
    requestId,
    ...(subAgentId && { subAgentId }),
    model: body.model,
    messageCount: body.messages.length,
    toolCount: body.tools.length,
  });

  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
      signal,
    });
  } catch (err: any) {
    if (signal?.aborted) {
      log.warn('Request aborted', {
        requestId,
        ...(subAgentId && { subAgentId }),
      });
      throw err;
    }
    log.error('Network error', {
      requestId,
      ...(subAgentId && { subAgentId }),
      error: err.message,
    });
    yield { type: 'error', error: `Network error: ${err.message}` };
    return;
  }

  const ttfb = Date.now() - startTime;
  log.info('API response', {
    requestId,
    ...(subAgentId && { subAgentId }),
    status: res.status,
    ttfbMs: ttfb,
  });

  if (!res.ok) {
    let errorMessage = `HTTP ${res.status}`;
    try {
      const body = await res.json();
      if (body.error) {
        errorMessage = body.error;
      }
      if (body.errorMessage) {
        errorMessage = body.errorMessage;
      }
    } catch {}
    log.error('API error', {
      requestId,
      ...(subAgentId && { subAgentId }),
      status: res.status,
      error: errorMessage,
    });
    yield { type: 'error', error: errorMessage };
    return;
  }

  // Parse SSE: each line is "data: {json}\n"
  const STALL_TIMEOUT_MS = 300_000; // 5 minutes
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    let stallTimer: ReturnType<typeof setTimeout>;
    let readResult: ReadableStreamReadResult<Uint8Array>;
    try {
      readResult = await Promise.race([
        reader.read(),
        new Promise<never>((_, reject) => {
          stallTimer = setTimeout(
            () => reject(new Error('stream_stall')),
            STALL_TIMEOUT_MS,
          );
        }),
      ]);
      clearTimeout(stallTimer!);
    } catch {
      clearTimeout(stallTimer!);
      await reader.cancel();
      log.error('Stream stalled', {
        requestId,
        ...(subAgentId && { subAgentId }),
        durationMs: Date.now() - startTime,
      });
      yield {
        type: 'error' as const,
        error: 'Stream stalled — no data received for 5 minutes',
      };
      return;
    }

    const { done, value } = readResult;
    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? ''; // Last element is incomplete

    for (const line of lines) {
      if (!line.startsWith('data: ')) {
        continue;
      }
      try {
        const event = JSON.parse(line.slice(6)) as StreamEvent;
        if (event.type === 'done') {
          const elapsed = Date.now() - startTime;
          log.info('Stream complete', {
            requestId,
            ...(subAgentId && { subAgentId }),
            durationMs: elapsed,
            stopReason: event.stopReason,
            inputTokens: event.usage.inputTokens,
            outputTokens: event.usage.outputTokens,
          });
        }
        yield event;
      } catch {
        // Skip malformed SSE lines
      }
    }
  }

  // Flush remaining buffer
  if (buffer.startsWith('data: ')) {
    try {
      yield JSON.parse(buffer.slice(6)) as StreamEvent;
    } catch {}
  }
}

// --- Retry wrapper ---

const MAX_RETRIES = 5;
const INITIAL_BACKOFF_MS = 1000;

function isRetryableError(error: string): boolean {
  return (
    /Network error/i.test(error) ||
    /HTTP 5\d\d/i.test(error) ||
    /Stream stalled/i.test(error) ||
    /overloaded/i.test(error) ||
    /terminated/i.test(error)
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Wrapper around streamChat that retries on transient failures.
 *
 * Buffers events per attempt. On success, yields all buffered events.
 * On retryable failure, discards the buffer and retries with exponential
 * backoff. This prevents the agent loop from accumulating partial text
 * from a failed attempt.
 */
export async function* streamChatWithRetry(
  params: Parameters<typeof streamChat>[0],
  options?: {
    onRetry?: (attempt: number, error: string) => void;
  },
): AsyncGenerator<StreamEvent> {
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const buffer: StreamEvent[] = [];
    let retryableFailure = false;

    for await (const event of streamChat(params)) {
      if (event.type === 'error') {
        if (isRetryableError(event.error) && attempt < MAX_RETRIES - 1) {
          options?.onRetry?.(attempt, event.error);
          retryableFailure = true;
          break;
        }
        // Non-retryable or final attempt — yield the error
        yield event;
        return;
      }
      buffer.push(event);
    }

    if (retryableFailure) {
      // Check abort before retrying
      if (params.signal?.aborted) {
        return;
      }
      const backoff = INITIAL_BACKOFF_MS * 2 ** attempt;
      log.warn('Retrying', {
        requestId: params.requestId,
        attempt: attempt + 1,
        maxRetries: MAX_RETRIES,
        backoffMs: backoff,
      });
      await sleep(backoff);
      continue;
    }

    // Success — flush buffer
    for (const event of buffer) {
      yield event;
    }
    return;
  }
}

// --- Background ack generation ---

const FALLBACK_ACK =
  '[Message sent to agent. Agent is working in the background and will report back with its results when finished.]';

/**
 * Generate a friendly acknowledgment message for a backgrounded sub-agent.
 * Falls back to a generic ack on any failure.
 */
export async function generateBackgroundAck(params: {
  apiConfig: { baseUrl: string; apiKey: string };
  agentName: string;
  task: string;
}): Promise<string> {
  const url = `${params.apiConfig.baseUrl}/_internal/v2/agent/remy/generate-ack`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${params.apiConfig.apiKey}`,
      },
      body: JSON.stringify({
        agentName: params.agentName,
        task: params.task,
      }),
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) {
      return FALLBACK_ACK;
    }
    const data = (await res.json()) as { message?: string };
    return data.message || FALLBACK_ACK;
  } catch (err: any) {
    return FALLBACK_ACK;
  }
}
