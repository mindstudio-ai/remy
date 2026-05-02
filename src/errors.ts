/**
 * Map raw error strings to user-friendly messages.
 *
 * Raw errors come from the API client (network failures, HTTP status codes)
 * and from tool execution. Users should see actionable messages, not
 * status codes or stack traces.
 */

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
    /HTTP 5\d\d/i,
    'The AI service is temporarily unavailable. Please try again.',
  ],
  [/Stream stalled/i, 'The connection was interrupted. Please try again.'],
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
