/**
 * SSE client for the agent chat endpoint.
 *
 * Makes POST requests to /_internal/v2/agent/chat and parses the
 * Server-Sent Events response stream into typed events. Returns an
 * async generator so the caller can process events as they arrive.
 *
 * The endpoint is vendor-agnostic — the platform handles model routing,
 * billing, and translating between our normalized format and the
 * provider's API (Anthropic, OpenAI, Gemini, etc.).
 */

import { log } from './logger.js';

// Normalized message format — matches the platform's ChatMessage type.
// The platform translates to/from provider-specific formats.
export interface Attachment {
  url: string;
  extractedTextUrl?: string;
}

export interface Message {
  role: 'system' | 'user' | 'assistant';
  content: string;
  // Assistant messages may include tool calls alongside text
  toolCalls?: Array<{ id: string; name: string; input: Record<string, any> }>;
  // User messages with toolCallId are tool results (not human messages)
  toolCallId?: string;
  isToolError?: boolean;
  // User messages may include file attachments
  attachments?: Attachment[];
}

// Tool definition sent to the LLM — vendor-agnostic JSON Schema format
export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, any>;
}

// Events yielded by the SSE stream
export type StreamEvent =
  | { type: 'text'; text: string }
  | { type: 'thinking'; text: string }
  | {
      type: 'tool_use';
      id: string;
      name: string;
      input: Record<string, any>;
    }
  | {
      type: 'done';
      stopReason: string;
      usage: { inputTokens: number; outputTokens: number };
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
  signal?: AbortSignal;
}): AsyncGenerator<StreamEvent> {
  const { baseUrl, apiKey, signal, ...body } = params;
  const url = `${baseUrl}/_internal/v2/agent/chat`;
  const startTime = Date.now();

  const messagesWithAttachments = body.messages.filter(
    (m) => m.attachments && m.attachments.length > 0,
  );
  log.info('POST agent/chat', {
    url,
    model: body.model,
    messageCount: body.messages.length,
    toolCount: body.tools.length,
    ...(messagesWithAttachments.length > 0 && {
      attachments: messagesWithAttachments.map((m) => ({
        role: m.role,
        attachmentCount: m.attachments!.length,
        urls: m.attachments!.map((a) => a.url),
      })),
    }),
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
      log.info('Request aborted by signal');
      throw err;
    }
    log.error('Network error', { error: err.message });
    yield { type: 'error', error: `Network error: ${err.message}` };
    return;
  }

  const ttfb = Date.now() - startTime;
  log.info(`Response ${res.status}`, { ttfb: `${ttfb}ms` });

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
    log.error('API error', { status: res.status, error: errorMessage });
    yield { type: 'error', error: errorMessage };
    return;
  }

  // Parse SSE: each line is "data: {json}\n"
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
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
            elapsed: `${elapsed}ms`,
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
