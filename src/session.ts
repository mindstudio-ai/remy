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
import { writeFileAtomicSync } from './atomicWrite.js';
import { createLogger } from './logger.js';
import { findSafeInsertionPoint } from './compaction/index.js';
import { findLastSummaryCheckpoint } from './subagents/common/cleanMessages.js';
// All byte limits (rotation thresholds, page budget, result caps) live in
// historyLimits.ts — one module tells the whole size-discipline story.
import {
  capMessageForHistory,
  HISTORY_PAGE_MAX_BYTES,
  HISTORY_DEFAULT_LIMIT,
  HISTORY_MAX_LIMIT,
  ROTATE_THRESHOLD_BYTES,
  RETAIN_TAIL_BYTES,
  ARCHIVE_RETENTION_BYTES,
} from './historyLimits.js';

const log = createLogger('session');

const SESSION_FILE = '.remy-session.json';
const ARCHIVE_DIR = '.logs/sessions';

// Shared archive-filename helpers (used by pruneArchives and the get_history
// read path). Every archive is `${label}-${ts}[.c${count}].json`; the ISO `ts`
// (with `:.` replaced by `-`) is fixed-width, so a lexicographic sort of the
// timestamp portion is chronological. The `.c<count>` segment (added below in
// archiveMessages) lets the read path learn a file's message count from its
// name alone — no parse on the latency-sensitive init frame.
const ARCHIVE_NAME_RE = /^(cleared|rotated)-.*\.json$/;
const archiveSortKey = (name: string): string =>
  name.replace(/^(cleared|rotated)-/, '');
const ARCHIVE_COUNT_RE = /\.c(\d+)\.json$/;

// Read-path caches (get_history). Archives are sealed/immutable, so a filename
// is a safe cache key. archiveCountCache is tiny (a filename→count int) and
// unbounded; archiveMsgCache holds parsed message arrays and is a small LRU —
// enough for the live↔newest-archive straddle plus sequential scroll-up.
// Entries for pruned files are simply never looked up again (listing is from
// readdirSync) and age out.
const archiveCountCache = new Map<string, number>();
const archiveMsgCache = new Map<string, Message[]>();
const ARCHIVE_MSG_CACHE_MAX = 3;

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
    // Unreadable session file — quarantine it before starting fresh, or the
    // first saveSession would overwrite the only copy of the history. A
    // missing file (the normal fresh start) lands here too; the rename just
    // ENOENTs and the inner catch swallows it.
    try {
      const quarantine = `${SESSION_FILE}.corrupt-${Date.now()}`;
      fs.renameSync(SESSION_FILE, quarantine);
      log.warn(`Session file unreadable — quarantined to ${quarantine}`);
    } catch {}
  }
  return false;
}

/**
 * Ensure every tool_use has a matching tool_result, and cap oversized results.
 *
 * If an assistant message has tool blocks in its content but the
 * following messages don't include matching tool_result entries
 * (e.g., due to a crash or cancellation bug), inject synthetic
 * error results so the API doesn't reject the conversation. Also heals any
 * oversized message already in history — sessions written before the
 * ingestion caps existed can hold multi-MB results and sub-agent transcripts
 * (see capMessageForHistory in historyLimits.ts for what gets capped and why
 * trimming is safe).
 */
function sanitizeMessages(messages: Message[]): Message[] {
  const result: Message[] = [];

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    capMessageForHistory(msg);
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
  // Embed the message count in the name (`.c<count>.json`) so the read path
  // learns it from readdirSync alone — no parse on the init frame — and it
  // drops for free when the file is pruned. pruneArchives's `.*` regex and
  // sortKey are unaffected (the fixed-width ISO ts still dominates the sort).
  const count = messages.length;
  let dest = path.join(ARCHIVE_DIR, `${label}-${ts}.c${count}.json`);
  let n = 1;
  while (fs.existsSync(dest)) {
    dest = path.join(ARCHIVE_DIR, `${label}-${ts}-${n++}.c${count}.json`);
  }
  const payload: Record<string, unknown> = { messages };
  if (models && Object.keys(models).length > 0) {
    payload.models = models;
  }
  writeFileAtomicSync(dest, JSON.stringify(payload));
  // Prime the count cache so a get_history right after an in-process rotation
  // resolves this file's count without a read.
  archiveCountCache.set(path.basename(dest), count);
  log.info('Session archived', { label, dest, messageCount: count });
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
      .filter((name) => ARCHIVE_NAME_RE.test(name));
    if (entries.length <= 1) {
      return;
    }

    // Newest first, by the timestamp in the filename (label prefix stripped).
    const archives = entries
      .map((name) => ({
        name,
        size: fs.statSync(path.join(ARCHIVE_DIR, name)).size,
      }))
      .sort((a, b) =>
        archiveSortKey(b.name).localeCompare(archiveSortKey(a.name)),
      );

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

// ---------------------------------------------------------------------------
// Paginated read path (get_history) — spans sealed archives + the live tail
// ---------------------------------------------------------------------------

/** A current-conversation archive placed in the global index space. */
interface ArchiveSlot {
  name: string;
  count: number;
  /** Global index of this archive's first message. */
  offset: number;
}

/**
 * Parse a sealed archive once, populating both caches. Returns null (and logs)
 * on a missing/corrupt file so callers skip it. Archives are immutable, so the
 * filename is a safe cache key.
 */
function parseArchive(name: string): Message[] | null {
  const cached = archiveMsgCache.get(name);
  if (cached) {
    // LRU touch: move to the most-recently-used end.
    archiveMsgCache.delete(name);
    archiveMsgCache.set(name, cached);
    return cached;
  }
  try {
    const raw = fs.readFileSync(path.join(ARCHIVE_DIR, name), 'utf-8');
    const data = JSON.parse(raw);
    const messages: Message[] = Array.isArray(data?.messages)
      ? (data.messages as Message[])
      : [];
    // Same heal loadSession applies to the live file, at the same boundary
    // (disk → memory): archives sealed before the ingestion caps existed can
    // hold multi-MB messages, and get_history serves pages straight from this
    // cache. The file itself stays sealed — only the parsed copy is capped.
    for (const msg of messages) {
      capMessageForHistory(msg);
    }
    archiveCountCache.set(name, messages.length);
    archiveMsgCache.set(name, messages);
    while (archiveMsgCache.size > ARCHIVE_MSG_CACHE_MAX) {
      const oldest = archiveMsgCache.keys().next().value as string | undefined;
      if (oldest === undefined) {
        break;
      }
      archiveMsgCache.delete(oldest);
    }
    return messages;
  } catch (err: any) {
    log.warn('Session archive unreadable', { name, error: err?.message });
    return null;
  }
}

/**
 * Message count for an archive — from the `.c<count>` filename segment (no
 * read), else a one-time parse for legacy archives. Null if unreadable.
 */
function archiveCount(name: string): number | null {
  const cached = archiveCountCache.get(name);
  if (cached !== undefined) {
    return cached;
  }
  const m = ARCHIVE_COUNT_RE.exec(name);
  if (m) {
    const n = Number(m[1]);
    archiveCountCache.set(name, n);
    return n;
  }
  const msgs = parseArchive(name);
  return msgs ? msgs.length : null;
}

/** Parsed messages for an archive (LRU-cached); empty array if unreadable. */
function readArchiveMessages(name: string): Message[] {
  return parseArchive(name) ?? [];
}

/**
 * The current conversation's sealed archives, oldest-first, with cumulative
 * global offsets. Scope = `rotated-*` newer than the most recent `cleared-*`
 * (or all `rotated-*` if never cleared); `cleared-*` and pre-clear `rotated-*`
 * are abandoned prior conversations and excluded (`/clear` archives everything
 * as `cleared-*`, then resets). Empty/uncountable files are dropped so global
 * ranges stay contiguous. Rebuilt from readdirSync each call — cheap, since
 * counts come from filenames — so it reflects in-process rotations and prunes.
 */
function listConversationArchives(): {
  slots: ArchiveSlot[];
  archivedCount: number;
} {
  let names: string[];
  try {
    names = fs.readdirSync(ARCHIVE_DIR).filter((n) => ARCHIVE_NAME_RE.test(n));
  } catch {
    return { slots: [], archivedCount: 0 };
  }

  let maxClearedKey: string | null = null;
  for (const name of names) {
    if (name.startsWith('cleared-')) {
      const key = archiveSortKey(name);
      if (maxClearedKey === null || key > maxClearedKey) {
        maxClearedKey = key;
      }
    }
  }

  const rotated = names
    .filter((n) => n.startsWith('rotated-'))
    .filter((n) => maxClearedKey === null || archiveSortKey(n) > maxClearedKey)
    .sort((a, b) => archiveSortKey(a).localeCompare(archiveSortKey(b)));

  const slots: ArchiveSlot[] = [];
  let offset = 0;
  for (const name of rotated) {
    const count = archiveCount(name);
    if (count === null || count <= 0) {
      continue;
    }
    slots.push({ name, count, offset });
    offset += count;
  }
  return { slots, archivedCount: offset };
}

/**
 * Paginated read over the current conversation's full history, spanning the
 * sealed archives followed by the live tail as one global index space:
 * archived messages occupy [0, archivedCount), live messages occupy
 * [archivedCount, total). `before` is an exclusive upper bound (default: the
 * end); `limit` caps the page size. Walk backward by passing the previous
 * response's `startIndex` as the next `before`; `startIndex === 0` is the start
 * of the conversation (or the oldest surviving message, if older archives were
 * pruned under the retention cap).
 *
 * Read-only: never mutates state.messages or the archives, and never re-enters
 * archived messages into state (that would re-bloat the live file on save and
 * defeat rotation). Serves raw messages (tool_results + hidden included, as the
 * live path does) — downstream transformHistory does the display filtering.
 */
export function getHistoryPage(
  state: AgentState,
  opts?: { before?: number; limit?: number },
): {
  messages: Message[];
  startIndex: number;
  endIndex: number;
  totalMessageCount: number;
} {
  const { slots, archivedCount } = listConversationArchives();
  const liveLen = state.messages.length;
  const total = archivedCount + liveLen;

  const rawLimit = opts?.limit;
  const limit =
    typeof rawLimit === 'number' && Number.isFinite(rawLimit)
      ? Math.min(Math.max(1, rawLimit | 0), HISTORY_MAX_LIMIT)
      : HISTORY_DEFAULT_LIMIT;
  const rawBefore = opts?.before;
  const before =
    typeof rawBefore === 'number' && Number.isFinite(rawBefore)
      ? Math.max(0, Math.min(rawBefore | 0, total))
      : total;

  // Peek one message by global index (for the boundary walk). Only ever touches
  // the archive/live array that already contains the index: rotation cuts at
  // findSafeInsertionPoint, so every seam begins on a non-tool_result and a
  // tool group never straddles a seam — the walk stays inside one array.
  const peekGlobal = (i: number): Message | undefined => {
    if (i >= archivedCount) {
      return state.messages[i - archivedCount];
    }
    for (const slot of slots) {
      if (i < slot.offset + slot.count) {
        return readArchiveMessages(slot.name)[i - slot.offset];
      }
    }
    return undefined;
  };

  // Clamp the page start back to a safe group boundary: never begin on a
  // tool_result (a user message carrying a toolCallId) whose owning tool_use is
  // in the previous page. May return slightly more than `limit` when adjusting.
  let startIndex = Math.max(0, before - limit);
  while (startIndex > 0) {
    const msg = peekGlobal(startIndex);
    if (msg && msg.role === 'user' && msg.toolCallId) {
      startIndex--;
    } else {
      break;
    }
  }
  const endIndex = before;

  // Assemble [startIndex, endIndex): overlapping archive slots (ascending),
  // then the live tail. A page straddling the archive→live boundary falls out
  // naturally (both branches contribute).
  const messages: Message[] = [];
  for (const slot of slots) {
    const slotEnd = slot.offset + slot.count;
    if (slotEnd <= startIndex || slot.offset >= endIndex) {
      continue;
    }
    const from = Math.max(startIndex, slot.offset) - slot.offset;
    const to = Math.min(endIndex, slotEnd) - slot.offset;
    const msgs = readArchiveMessages(slot.name);
    for (let i = from; i < to; i++) {
      messages.push(msgs[i]);
    }
  }
  if (endIndex > archivedCount) {
    const from = Math.max(startIndex, archivedCount) - archivedCount;
    const to = endIndex - archivedCount;
    for (let i = from; i < to; i++) {
      messages.push(state.messages[i]);
    }
  }

  // Enforce the byte ceiling: keep the newest messages that fit, shifting
  // startIndex forward over what's dropped (the array maps 1:1 onto
  // [startIndex, endIndex), so the page stays contiguous and the caller's
  // next `before = startIndex` walk picks up exactly where this page cut).
  // The newest message is always kept, even alone over budget.
  if (messages.length > 1) {
    let bytes = 0;
    let cut = 0;
    for (let i = messages.length - 1; i >= 0; i--) {
      bytes += Buffer.byteLength(JSON.stringify(messages[i]), 'utf-8') + 1;
      if (bytes > HISTORY_PAGE_MAX_BYTES && i < messages.length - 1) {
        cut = i + 1;
        break;
      }
    }
    if (cut > 0) {
      // Same boundary rule as the limit clamp above, in the other direction:
      // never begin the page on a tool_result whose tool_use was dropped.
      while (
        cut < messages.length - 1 &&
        messages[cut]?.role === 'user' &&
        messages[cut]?.toolCallId
      ) {
        cut++;
      }
      messages.splice(0, cut);
      startIndex += cut;
      log.info('History page trimmed to byte budget', {
        dropped: cut,
        kept: messages.length,
        startIndex,
      });
    }
  }

  return { messages, startIndex, endIndex, totalMessageCount: total };
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
    writeFileAtomicSync(SESSION_FILE, serialized);
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
  // Model picks persist in the session file being deleted below — clearing
  // the session resets them too, or the in-memory picks would silently
  // diverge from disk (applied until the process restarts, then gone).
  state.models = undefined;
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
