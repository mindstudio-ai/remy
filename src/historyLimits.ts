/**
 * Every byte limit on conversation history, and the capping functions that
 * enforce them. One module so "what bounds exist?" has one answer.
 *
 * The pipeline, in order, with where each layer is enforced:
 *
 *   1. Ingestion — capToolResult on every tool result as it enters a live
 *      conversation (agent.ts and subagents/runner.ts). Protects the model
 *      context: a ~12.9MB runMethod result once got stored verbatim and
 *      re-sent on every turn, pushing every request past the gateway's body
 *      limit (HTTP 413).
 *   2. Attach — capSubAgentTranscript when a finished sub-agent's transcript
 *      is persisted onto its tool block (agent.ts and subagents/runner.ts).
 *      Protects persisted history: browserCommand returns a full
 *      accessibility snapshot (~300KB against a dense data grid) per step,
 *      so one ~20-step screenshot run persisted a ~6MB transcript; four of
 *      them made a 16MB get_history page that could never be built and
 *      delivered inside the editor's 15s connection deadline — a permanent
 *      "Connection Lost" for that app.
 *   3. Load — capMessageForHistory at the disk→memory boundary
 *      (session.ts loadSession and parseArchive). Heals sessions and sealed
 *      archives written before layers 1–2 existed.
 *   4. Serve — HISTORY_PAGE_MAX_BYTES on every get_history page
 *      (session.ts getHistoryPage), so the page that feeds the sandbox init
 *      frame is bounded regardless of what the other layers missed.
 *   5. Save — ROTATE_THRESHOLD_BYTES whole-file rotation and
 *      ARCHIVE_RETENTION_BYTES archive pruning (session.ts saveSession).
 *
 * Not here: tools/code/bash.ts MAX_OUTPUT_BYTES — a tool-local self-cap on
 * command output, applied before the result ever reaches layer 1.
 *
 * All capping mutates messages in place: by the time anything here runs, the
 * turn or sub-agent run that produced the message is over, and the same
 * object may be referenced from state.messages and a persistence payload —
 * capping the one copy is the point.
 */

import type { Message, ContentBlock } from './api.js';

// --- Layer 1: ingestion ---

// Mirrors the byte-truncation shape in tools/code/bash.ts: measure UTF-8
// bytes, slice to a byte-exact head, append a marker telling the model to
// narrow the call rather than refetch everything. Local tools already
// self-cap well below this, so applying it uniformly is a no-op for them and
// a hard ceiling for the external data tools (runMethod, testJewel,
// queryDatabase, browserCommand), which have no self-imposed cap.
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

// --- Layer 2: attach ---

// The live sub-agent run keeps the full MAX_TOOL_RESULT_BYTES per result;
// these tighter bounds apply only to the transcript that outlives the run —
// for the frontend's drill-in view and, for the few sub-agents that resume
// from prior transcripts (designExpert, productVision), as stale context
// they can always refetch from.
export const MAX_SUBAGENT_RESULT_BYTES = 32 * 1024;
export const MAX_SUBAGENT_TRANSCRIPT_BYTES = 512 * 1024;

/**
 * Bound a sub-agent transcript before it's persisted onto a tool block:
 * cap every tool result inside it, recurse into nested transcripts, then
 * drop oldest messages until the whole transcript fits the byte budget.
 * Returns the possibly-shortened array.
 */
export function capSubAgentTranscript(messages: Message[]): Message[] {
  for (const msg of messages) {
    capMessageForHistory(msg, MAX_SUBAGENT_RESULT_BYTES);
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

// --- Layer 3: load (and the per-message walk layer 2 reuses) ---

/**
 * The canonical per-message cap: every message crossing into history — from
 * a finished sub-agent run (layer 2) or from disk (layer 3) — passes through
 * here. Caps an assistant message's tool-block `result` and
 * `backgroundResult`, a user tool-result message's `content`, and recurses
 * into persisted sub-agent transcripts.
 *
 * `maxBytes` is the per-result bound: MAX_TOOL_RESULT_BYTES for top-level
 * history (matching what ingestion allowed), MAX_SUBAGENT_RESULT_BYTES when
 * called on transcript messages by capSubAgentTranscript.
 */
export function capMessageForHistory(
  msg: Message,
  maxBytes = MAX_TOOL_RESULT_BYTES,
): void {
  if (msg.role === 'assistant' && Array.isArray(msg.content)) {
    for (const block of msg.content as ContentBlock[]) {
      if (block.type !== 'tool') {
        continue;
      }
      if (typeof block.result === 'string') {
        block.result = capToolResult(block.result, maxBytes);
      }
      if (typeof block.backgroundResult === 'string') {
        block.backgroundResult = capToolResult(
          block.backgroundResult,
          maxBytes,
        );
      }
      if (Array.isArray(block.subAgentMessages)) {
        block.subAgentMessages = capSubAgentTranscript(block.subAgentMessages);
      }
    }
  } else if (
    msg.role === 'user' &&
    msg.toolCallId &&
    typeof msg.content === 'string'
  ) {
    msg.content = capToolResult(msg.content, maxBytes);
  }
}

// --- Layer 4: serve ---

// Byte ceiling on a single get_history page, enforced after the
// message-count limit. The count limit alone cannot bound a page: message
// sizes vary by orders of magnitude (a capped tool result is 256KB; pre-cap
// sealed archives hold multi-MB messages). The sandbox builds its WS init
// frame from one of these pages and the editor drops any connection that
// hasn't hydrated within 15s — a 16MB page reproducibly wedged an app in a
// permanent reconnect loop ("Connection Lost"). At the observed ~1.2MB/s
// through the stdin/stdout IPC + transform + WS pipeline, 2MB keeps the
// worst-case page comfortably inside that deadline; the frontend lazy-loads
// older pages, so nothing is lost — just paged.
export const HISTORY_PAGE_MAX_BYTES = 2 * 1024 * 1024;

// Page sizes for the paginated get_history read path — clamping happens
// against the global archive + live total that getHistoryPage owns.
export const HISTORY_DEFAULT_LIMIT = 500;
export const HISTORY_MAX_LIMIT = 2000;

// --- Layer 5: save ---

// Auto-rotation tunables — the scrollback-depth vs per-snapshot-churn knob.
// Rotate once the serialized live file exceeds the threshold, keeping roughly
// the most recent RETAIN_TAIL_BYTES of messages live for scrollback and
// archiving the rest. RETAIN must stay below THRESHOLD so rotation isn't
// constant.
//
// Set generously: the sealed-archive design (each rotation writes a new
// write-once file) is what removes the real hazard — the same growing blob
// being rewritten on every snapshot. The threshold only caps the worst-case
// size of a single snapshot's live-file rewrite. The incident that motivated
// this was a 124 MB file; 32 MB keeps worst-case churn far below that while
// leaving deep scrollback intact.
export const ROTATE_THRESHOLD_BYTES = 32 * 1024 * 1024;
export const RETAIN_TAIL_BYTES = 16 * 1024 * 1024;

// Retention cap for the sealed archives under .logs/sessions/. Rotation is
// archive-not-delete, so without a cap the archive dir grows forever and —
// via the app's _draft snapshot — bloats the whole-repo tar the git server
// re-uploads on every flush. Keep the most recent archives up to this many
// bytes (enough scrollback for debugging/support) and drop the oldest; always
// keep at least the newest archive, even if it alone exceeds the budget.
export const ARCHIVE_RETENTION_BYTES = 64 * 1024 * 1024;
