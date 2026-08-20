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

import type { Message, ContentBlock } from './api.js';

export const MAX_TOOL_RESULT_BYTES = 256 * 1024;

export function capToolResult(
  result: string,
  maxBytes = MAX_TOOL_RESULT_BYTES,
): string {
  const total = Buffer.byteLength(result, 'utf-8');
  if (total <= maxBytes) {
    return result;
  }
  const head = Buffer.from(result, 'utf-8')
    .subarray(0, maxBytes)
    .toString('utf-8');
  return (
    head +
    `\n\n(tool result truncated at ${(maxBytes / 1024).toFixed(0)}KB of ` +
    `${(total / 1024).toFixed(0)}KB — too large to keep in context. Narrow the call ` +
    `(select fewer fields, paginate, or query a subset) instead of fetching everything.)`
  );
}

// Caps for sub-agent transcripts persisted onto tool blocks
// (block.subAgentMessages). The live sub-agent run keeps the full
// MAX_TOOL_RESULT_BYTES per result; these tighter bounds apply only to the
// transcript that outlives the run — for the frontend's drill-in view and,
// for the few sub-agents that resume from prior transcripts (designExpert,
// productVision), as stale context they can always refetch from.
//
// Motivating incident: browserCommand returns a full accessibility snapshot
// (~300KB against a dense data grid) on every step; a single screenshot run
// with ~20 steps persisted a ~6MB transcript, four of them made a 16MB
// get_history page, and the sandbox init frame could no longer be built and
// delivered inside the editor's 15s connection deadline — a permanent
// "Connection Lost" for that app until session rotation happened to evict
// the messages.
export const MAX_SUBAGENT_RESULT_BYTES = 32 * 1024;
export const MAX_SUBAGENT_TRANSCRIPT_BYTES = 512 * 1024;

/**
 * Bound a sub-agent transcript before it's persisted onto a tool block:
 * cap every tool result inside it, recurse into nested transcripts, then
 * drop oldest messages until the whole transcript fits the byte budget.
 * Mutates message objects in place (the run that produced them is over);
 * returns the possibly-shortened array.
 */
export function capSubAgentTranscript(messages: Message[]): Message[] {
  for (const msg of messages) {
    if (msg.role === 'assistant' && Array.isArray(msg.content)) {
      for (const block of msg.content as ContentBlock[]) {
        if (block.type !== 'tool') {
          continue;
        }
        if (typeof block.result === 'string') {
          block.result = capToolResult(block.result, MAX_SUBAGENT_RESULT_BYTES);
        }
        if (typeof block.backgroundResult === 'string') {
          block.backgroundResult = capToolResult(
            block.backgroundResult,
            MAX_SUBAGENT_RESULT_BYTES,
          );
        }
        if (Array.isArray(block.subAgentMessages)) {
          block.subAgentMessages = capSubAgentTranscript(
            block.subAgentMessages,
          );
        }
      }
    } else if (
      msg.role === 'user' &&
      msg.toolCallId &&
      typeof msg.content === 'string'
    ) {
      msg.content = capToolResult(msg.content, MAX_SUBAGENT_RESULT_BYTES);
    }
  }

  const sizes = messages.map(
    (m) => Buffer.byteLength(JSON.stringify(m), 'utf-8') + 1,
  );
  let total = sizes.reduce((a, b) => a + b, 0);
  if (total <= MAX_SUBAGENT_TRANSCRIPT_BYTES) {
    return messages;
  }

  // Drop oldest whole messages until within budget (always keep the newest),
  // then step past any leading tool results whose tool_use was just dropped.
  let start = 0;
  while (start < messages.length - 1 && total > MAX_SUBAGENT_TRANSCRIPT_BYTES) {
    total -= sizes[start];
    start++;
  }
  while (
    start < messages.length - 1 &&
    messages[start].role === 'user' &&
    messages[start].toolCallId
  ) {
    start++;
  }
  return messages.slice(start);
}
