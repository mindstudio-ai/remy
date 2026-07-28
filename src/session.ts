/**
 * Session persistence — saves/loads conversation history to a file.
 *
 * Writes .remy-session.json in the working directory after each turn.
 * On boot, loads existing session if present, giving the agent full
 * context of prior work. Delete the file to start fresh.
 *
 * Auto-rotation: once the live file crosses ROTATE_THRESHOLD_BYTES,
 * saveSession archives the oldest messages into a sealed timestamped file
 * under .logs/sessions/ and keeps a recent tail live — the automatic mirror
 * of what /clear does (clearSession), minus the reset. Both go through the
 * same archiveMessages primitive, so every .logs/sessions/*.json shares one
 * schema and looks identical to a reader. This keeps the committed file
 * bounded (it's persisted to the app's _draft branch every snapshot) while
 * preserving the full history across sealed archives.
 */

import fs from 'node:fs';
import path from 'node:path';
import type { Message, ContentBlock } from './api.js';
import type { AgentState } from './agent.js';
import { createLogger } from './logger.js';
import { findSafeInsertionPoint } from './compaction/index.js';
import { findLastSummaryCheckpoint } from './subagents/common/cleanMessages.js';
import { capToolResult } from './toolResultCap.js';

const log = createLogger('session');

const SESSION_FILE = '.remy-session.json';
const ARCHIVE_DIR = '.logs/sessions';

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
const ROTATE_THRESHOLD_BYTES = 32 * 1024 * 1024;
const RETAIN_TAIL_BYTES = 16 * 1024 * 1024;

// Retention cap for the sealed archives under ARCHIVE_DIR. Rotation is
// archive-not-delete, so without a cap .logs/sessions/ grows forever and — via
// the app's _draft snapshot — bloats the whole-repo tar the git server
// re-uploads on every flush. Keep the most recent archives up to this many
// bytes (enough scrollback for debugging/support) and drop the oldest; always
// keep at least the newest archive, even if it alone exceeds the budget.
const ARCHIVE_RETENTION_BYTES = 64 * 1024 * 1024;

export function loadSession(state: AgentState): boolean {
  // Heal already-bloated apps on boot: enforce the archive cap once per
  // process, before touching the live file. Runs on both surfaces — headless
  // and TUI both call loadSession once at startup.
  pruneArchives();
  try {
    const raw = fs.readFileSync(SESSION_FILE, 'utf-8');
    const data = JSON.parse(raw);
    if (data.models && typeof data.models === 'object') {
      state.models = data.models as Record<string, string>;
    }
    if (Array.isArray(data.messages) && data.messages.length > 0) {
      state.messages = sanitizeMessages(data.messages as Message[]);
      log.info('Session loaded', {
        messageCount: state.messages.length,
        ...(state.models && { models: state.models }),
      });
      return true;
    }
  } catch {
    // No session file or invalid — start fresh
  }
  return false;
}

/**
 * Cap oversized tool results already stored in a loaded session, in place.
 *
 * Heals sessions poisoned before the ingestion cap existed (toolResultCap):
 * an assistant tool block's `result` and its paired tool-result user message
 * `content` can each hold a multi-MB blob that makes every subsequent request
 * body exceed the gateway limit (HTTP 413). Capping on load shrinks them so the
 * session sends again; it only trims context that was never successfully sent
 * (the oversized turn 413'd every time), so nothing the model used is lost.
 */
function capOversizedResults(msg: Message): void {
  if (msg.role === 'assistant' && Array.isArray(msg.content)) {
    for (const block of msg.content as ContentBlock[]) {
      if (block.type === 'tool' && typeof block.result === 'string') {
        block.result = capToolResult(block.result);
      }
    }
  } else if (
    msg.role === 'user' &&
    msg.toolCallId &&
    typeof msg.content === 'string'
  ) {
    msg.content = capToolResult(msg.content);
  }
}

/**
 * Ensure every tool_use has a matching tool_result, and cap oversized results.
 *
 * If an assistant message has tool blocks in its content but the
 * following messages don't include matching tool_result entries
 * (e.g., due to a crash or cancellation bug), inject synthetic
 * error results so the API doesn't reject the conversation. Also caps any
 * oversized tool result already in history (see capOversizedResults).
 */
function sanitizeMessages(messages: Message[]): Message[] {
  const result: Message[] = [];

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    capOversizedResults(msg);
    result.push(msg);

    if (msg.role !== 'assistant' || !Array.isArray(msg.content)) {
      continue;
    }

    // Extract tool blocks from content
    const toolBlocks = (msg.content as ContentBlock[]).filter(
      (b): b is ContentBlock & { type: 'tool' } => b.type === 'tool',
    );
    if (toolBlocks.length === 0) {
      continue;
    }

    // Collect tool_result ids from the messages immediately following
    const resultIds = new Set<string>();
    for (let j = i + 1; j < messages.length; j++) {
      const next = messages[j];
      if (next.role === 'user' && next.toolCallId) {
        resultIds.add(next.toolCallId);
      } else {
        break; // tool_results must be immediately after the assistant message
      }
    }

    // Inject missing tool_results
    for (const tc of toolBlocks) {
      if (!resultIds.has(tc.id)) {
        result.push({
          role: 'user',
          content: 'Error: tool result lost (session recovered)',
          toolCallId: tc.id,
          isToolError: true,
        });
      }
    }
  }

  return result;
}

function buildPayload(state: AgentState): Record<string, unknown> {
  const payload: Record<string, unknown> = { messages: state.messages };
  if (state.models && Object.keys(state.models).length > 0) {
    payload.models = state.models;
  }
  return payload;
}

/**
 * Write a sealed, timestamped archive of `messages` under .logs/sessions/.
 * One schema for every archive — compact `{ messages, models? }`, the same
 * shape saveSession writes — so cleared and rotated files look identical to
 * a reader. Sealed: never overwrites an existing archive.
 */
function archiveMessages(
  messages: Message[],
  label: 'cleared' | 'rotated',
  models?: Record<string, string>,
): string {
  fs.mkdirSync(ARCHIVE_DIR, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  let dest = path.join(ARCHIVE_DIR, `${label}-${ts}.json`);
  let n = 1;
  while (fs.existsSync(dest)) {
    dest = path.join(ARCHIVE_DIR, `${label}-${ts}-${n++}.json`);
  }
  const payload: Record<string, unknown> = { messages };
  if (models && Object.keys(models).length > 0) {
    payload.models = models;
  }
  fs.writeFileSync(dest, JSON.stringify(payload), 'utf-8');
  log.info('Session archived', { label, dest, messageCount: messages.length });
  pruneArchives();
  return dest;
}

/**
 * Enforce ARCHIVE_RETENTION_BYTES over ARCHIVE_DIR: keep the newest archives
 * whose cumulative size stays under the budget (always keeping at least the
 * newest), delete the rest oldest-first.
 *
 * Sorts by the ISO timestamp embedded in the filename, NOT mtime — `git
 * restore` on a fresh VM boot rewrites every archive with the same restore-time
 * mtime, which would make a boot-time prune evict arbitrary files. The filename
 * timestamp is restore-stable.
 *
 * Best-effort and silent on a missing dir: a prune failure must never abort a
 * rotation or crash a turn (rotate() does not wrap its archiveMessages call).
 */
function pruneArchives(): void {
  try {
    const entries = fs
      .readdirSync(ARCHIVE_DIR)
      .filter((name) => /^(cleared|rotated)-.*\.json$/.test(name));
    if (entries.length <= 1) {
      return;
    }

    // Newest first, by the timestamp in the filename (label prefix stripped).
    const sortKey = (name: string): string =>
      name.replace(/^(cleared|rotated)-/, '');
    const archives = entries
      .map((name) => ({
        name,
        size: fs.statSync(path.join(ARCHIVE_DIR, name)).size,
      }))
      .sort((a, b) => sortKey(b.name).localeCompare(sortKey(a.name)));

    // Keep the newest archives up to the byte budget (always at least one);
    // everything from the cutoff onward is older and gets deleted.
    let kept = 0;
    let cut = archives.length;
    for (let i = 0; i < archives.length; i++) {
      if (i === 0 || kept + archives[i].size <= ARCHIVE_RETENTION_BYTES) {
        kept += archives[i].size;
      } else {
        cut = i;
        break;
      }
    }

    let removed = 0;
    let freed = 0;
    for (let i = cut; i < archives.length; i++) {
      try {
        fs.unlinkSync(path.join(ARCHIVE_DIR, archives[i].name));
        freed += archives[i].size;
        removed++;
      } catch {
        // best-effort per file
      }
    }

    if (removed > 0) {
      log.info('Session archives pruned', {
        removed,
        freedBytes: freed,
        keptBytes: kept,
      });
    }
  } catch {
    // Missing dir or unreadable — nothing to prune.
  }
}

/**
 * If the session is over threshold, archive the oldest messages and truncate
 * state.messages to a recent tail. Returns true when a rotation happened.
 *
 * The cut never falls at/after the last conversation summary checkpoint —
 * cleanMessagesForApi keeps only that checkpoint plus what follows, so the
 * model's on-resume context is unchanged — and is snapped to a safe boundary
 * so a tool_use is never split from its tool_results. Everything before the
 * cut is preserved verbatim in the archive.
 */
function rotate(state: AgentState): boolean {
  const messages = state.messages;
  if (messages.length === 0) {
    return false;
  }

  // Walk back from the end, keeping ~RETAIN_TAIL_BYTES of recent messages.
  let tailBytes = 0;
  let scrollbackStart = 0;
  for (let i = messages.length - 1; i >= 0; i--) {
    tailBytes += Buffer.byteLength(JSON.stringify(messages[i]), 'utf-8') + 1;
    if (tailBytes >= RETAIN_TAIL_BYTES) {
      scrollbackStart = i;
      break;
    }
  }

  // Never evict at/after the last conversation checkpoint.
  const checkpointIdx = findLastSummaryCheckpoint(messages, 'conversation');
  let cut =
    checkpointIdx === -1
      ? scrollbackStart
      : Math.min(scrollbackStart, checkpointIdx);

  // Snap to a boundary that doesn't split a tool_use from its tool_results.
  cut = findSafeInsertionPoint(messages, cut);
  if (cut <= 0) {
    return false;
  }

  archiveMessages(messages.slice(0, cut), 'rotated', state.models);
  state.messages = messages.slice(cut);
  log.info('Session rotated', {
    archived: cut,
    retained: state.messages.length,
  });
  return true;
}

export function saveSession(state: AgentState): void {
  try {
    let serialized = JSON.stringify(buildPayload(state));
    if (
      Buffer.byteLength(serialized, 'utf-8') > ROTATE_THRESHOLD_BYTES &&
      rotate(state)
    ) {
      serialized = JSON.stringify(buildPayload(state));
    }
    fs.writeFileSync(SESSION_FILE, serialized, 'utf-8');
    log.info('Session saved', { messageCount: state.messages.length });
  } catch (err: any) {
    log.warn('Session save failed', { error: err.message });
  }
}

export function clearSession(state: AgentState): void {
  // Archive the whole conversation, then start fresh — the same archiving
  // path as rotation (uniform schema), just applied to everything with a reset.
  try {
    if (state.messages.length > 0) {
      archiveMessages(state.messages, 'cleared', state.models);
    }
  } catch (err: any) {
    log.warn('Session archive on clear failed', { error: err.message });
  }
  state.messages = [];
  try {
    if (fs.existsSync(SESSION_FILE)) {
      fs.unlinkSync(SESSION_FILE);
    }
  } catch (err: any) {
    log.warn('Session clear: could not remove live file', {
      error: err.message,
    });
  }
}
