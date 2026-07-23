/**
 * Hard byte cap on a single tool result before it enters conversation history.
 *
 * Motivating incident: a `runMethod → getArtifact` call returned a ~12.9MB
 * result that was stored verbatim in the tool block AND re-sent as the paired
 * tool-result message on every turn, pushing the request body past the model
 * gateway's size limit → HTTP 413 on every message. External data tools
 * (runMethod, queryDatabase, browserCommand) have no self-imposed cap the way
 * bash.ts does (MAX_OUTPUT_BYTES), and session rotation only fires on the whole
 * file at 32MB — it can never evict one oversized recent message. This is the
 * missing per-result guard.
 *
 * Mirrors the byte-truncation shape in tools/code/bash.ts: measure UTF-8 bytes,
 * slice to a byte-exact head, append a marker telling the model to narrow the
 * call rather than refetch everything. Local tools already self-cap well below
 * this, so applying it uniformly is a no-op for them and a hard ceiling for the
 * external data tools.
 */

export const MAX_TOOL_RESULT_BYTES = 256 * 1024;

export function capToolResult(result: string): string {
  const total = Buffer.byteLength(result, 'utf-8');
  if (total <= MAX_TOOL_RESULT_BYTES) {
    return result;
  }
  const head = Buffer.from(result, 'utf-8')
    .subarray(0, MAX_TOOL_RESULT_BYTES)
    .toString('utf-8');
  return (
    head +
    `\n\n(tool result truncated at ${(MAX_TOOL_RESULT_BYTES / 1024).toFixed(0)}KB of ` +
    `${(total / 1024).toFixed(0)}KB — too large to keep in context. Narrow the call ` +
    `(select fewer fields, paginate, or query a subset) instead of fetching everything.)`
  );
}
