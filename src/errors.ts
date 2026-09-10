/**
 * Map raw error strings to user-friendly messages.
 *
 * Raw errors come from the API client (network failures, HTTP status codes)
 * and from tool execution. Users should see actionable messages, not
 * status codes or stack traces.
 */

/**
 * Provider "the prompt/context is too large" phrasings, across vendors:
 * Gemini's INVALID_ARGUMENT about the input token count, Anthropic's "prompt
 * is too long", OpenAI's context_length_exceeded / maximum context length, and
 * a raw HTTP 413. The youai-api develop route now tags these with a
 * `context_overflow` code (preferred); this pattern is the fallback for older
 * servers that only send the raw message.
 */
const OVERFLOW_PATTERN =
  /input token count.*exceeds|exceeds the maximum number of tokens|prompt is too long|context[_ ]length[_ ]exceeded|maximum context length|HTTP 413|payload too large|request entity too large/i;

/**
 * True when an LLM error is a context-window overflow — the agent loop uses
 * this to compact and retry once instead of ending the turn. `code` is the
 * server's machine-readable classification (set to `context_overflow` by the
 * develop route); `message` is the fallback for older servers.
 */
export function isContextOverflowError(
  message: string,
  code?: string,
): boolean {
  if (code === 'context_overflow') {
    return true;
  }
  return OVERFLOW_PATTERN.test(message);
}

const patterns: Array<[RegExp, string]> = [
  [
    /Network error/i,
    'Lost connection to the server. Please check your internet connection and try again.',
  ],
  [
    /HTTP 429|rate limit/i,
    'Too many requests. Please wait a moment and try again.',
  ],
  [/HTTP 40[13]/i, 'Authentication failed. Please check your API key.'],
  [
    /HTTP 413/i,
    'This conversation has grown too large to send in a single request. Starting a new conversation will reset the context.',
  ],
  [
    /HTTP 5\d\d/i,
    'The AI service is temporarily unavailable. Please try again.',
  ],
  [/Stream stalled/i, 'The connection was interrupted. Please try again.'],
  [
    // A too-large-context failure that survived the automatic compact-and-retry
    // (or came from an older server). Kept ahead of the generic fallback so a
    // raw provider string (e.g. Gemini's INVALID_ARGUMENT JSON) never reaches
    // the user.
    OVERFLOW_PATTERN,
    "This conversation outgrew the model's context window. Remy compacted it and tried again; if you keep seeing this, run /compact or start a new conversation.",
  ],
  [
    /content filter|Output blocked/i,
    "The AI model's content moderation filter blocked this response. These are usually false positives, we apologize for the interruption. Rephrasing your request typically fixes this.",
  ],
];

export function friendlyError(raw: string): string {
  for (const [pattern, message] of patterns) {
    if (pattern.test(raw)) {
      return message;
    }
  }
  return `Something went wrong: ${raw}`;
}
