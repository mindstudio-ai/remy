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

export function loadSession(state: AgentState): boolean {
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
 * Ensure every tool_use has a matching tool_result.
 *
 * If an assistant message has tool blocks in its content but the
 * following messages don't include matching tool_result entries
 * (e.g., due to a crash or cancellation bug), inject synthetic
 * error results so the API doesn't reject the conversation.
 */
function sanitizeMessages(messages: Message[]): Message[] {
  const result: Message[] = [];

  for (let i = 0; i < messages.length; i++) {
    result.push(messages[i]);
    const msg = messages[i];

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
  return dest;
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
