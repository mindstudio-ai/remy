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

// Normalized message format — matches the platform's ChatMessage type.
// The platform translates to/from provider-specific formats.
export interface Message {
  role: 'system' | 'user' | 'assistant';
  content: string;
  // Assistant messages may include tool calls alongside text
  toolCalls?: Array<{ id: string; name: string; input: Record<string, any> }>;
  // User messages with toolCallId are tool results (not human messages)
  toolCallId?: string;
  isToolError?: boolean;
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
}): AsyncGenerator<StreamEvent> {
  const { baseUrl, apiKey, ...body } = params;

  const res = await fetch(`${baseUrl}/_internal/v2/agent/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
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
        yield JSON.parse(line.slice(6)) as StreamEvent;
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
