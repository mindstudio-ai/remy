/**
 * Session stats persistence for the headless protocol.
 *
 * Writes .remy-stats.json with cumulative turn/token stats plus the
 * message queue so queued work survives process restarts.
 */

import { readFileSync } from 'node:fs';
import { writeFileAtomicSync } from '../atomicWrite.js';
import type { QueuedMessage } from './messageQueue.js';

const STATS_FILE = '.remy-stats.json';

export interface SessionStats {
  messageCount: number;
  turns: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCacheCreationTokens: number;
  totalCacheReadTokens: number;
  lastContextSize: number;
  compactionInProgress: boolean;
  updatedAt: number;
}

export function createSessionStats(): SessionStats {
  return {
    messageCount: 0,
    turns: 0,
    totalInputTokens: 0,
    totalOutputTokens: 0,
    totalCacheCreationTokens: 0,
    totalCacheReadTokens: 0,
    lastContextSize: 0,
    compactionInProgress: false,
    updatedAt: 0,
  };
}

/**
 * A completed passive background result parked in the holding pen — outside
 * the message queue so it can never wake the agent, latch the sandbox busy
 * state, or trigger resume-on-restart. Swept into the next real turn as a
 * hidden background_results entry.
 */
export interface PassiveResult {
  toolCallId: string;
  name: string;
  result: string;
}

/** Load persisted message queue from disk. Returns empty array if absent. */
export function loadQueue(): QueuedMessage[] {
  try {
    const stats = JSON.parse(readFileSync(STATS_FILE, 'utf-8'));
    if (Array.isArray(stats.queue)) {
      return stats.queue as QueuedMessage[];
    }
  } catch {
    // No stats file or invalid — start fresh
  }
  return [];
}

/** Load the persisted passive-result pen. Returns empty array if absent. */
export function loadPassiveResults(): PassiveResult[] {
  try {
    const stats = JSON.parse(readFileSync(STATS_FILE, 'utf-8'));
    if (Array.isArray(stats.passiveResults)) {
      return stats.passiveResults as PassiveResult[];
    }
  } catch {
    // No stats file or invalid — start fresh
  }
  return [];
}

/**
 * The workspace-behind note's durable state.
 *
 * Both halves have to survive a restart, for opposite reasons. `lastNotedUpstream`
 * is what makes the note fire once per upstream tip rather than once per boot —
 * a bare remy restart on the same tip must stay quiet, while a colleague
 * publishing again is a new tip and re-arms it. `pendingNote` is a note that has
 * been parked but not yet ridden a turn, which is the normal state for a
 * workspace nobody has typed into: without persisting it, a restart before the
 * first message would drop it silently AND leave `lastNotedUpstream` set, so it
 * would never fire at all.
 *
 * Kept in `.remy-stats.json` rather than a file of its own on purpose. The app
 * template's `.gitignore` names each `.remy-*` file explicitly instead of by
 * wildcard, and every existing app carries its own copy that cannot be changed
 * retroactively — so a new sibling file would sit untracked in every app that
 * already exists and could be swept into a publish commit.
 */
export interface WorkspaceNotice {
  /** Note text awaiting the next real turn, or null when nothing is parked. */
  pendingNote: string | null;
  /** `origin/<default>` tip the last note was raised for. */
  lastNotedUpstream: string | null;
}

export function emptyWorkspaceNotice(): WorkspaceNotice {
  return { pendingNote: null, lastNotedUpstream: null };
}

/** Load the persisted workspace-behind state. Empty when absent or invalid. */
export function loadWorkspaceNotice(): WorkspaceNotice {
  try {
    const stats = JSON.parse(readFileSync(STATS_FILE, 'utf-8'));
    const notice = stats.workspaceNotice;
    if (notice && typeof notice === 'object') {
      return {
        pendingNote:
          typeof notice.pendingNote === 'string' ? notice.pendingNote : null,
        lastNotedUpstream:
          typeof notice.lastNotedUpstream === 'string'
            ? notice.lastNotedUpstream
            : null,
      };
    }
  } catch {
    // No stats file or invalid — start fresh
  }
  return emptyWorkspaceNotice();
}

/** Persist stats + queue + passive pen to disk. Best-effort (swallows errors).
 *
 * `suggestCompactAt` is the active parent model's /compact suggestion
 * threshold (models/surfaces getSuggestCompactAt) — the frontend composer
 * shows its ContextBar once lastContextSize exceeds it. */
export function writeStats(
  stats: SessionStats,
  queue: QueuedMessage[],
  passiveResults: PassiveResult[],
  suggestCompactAt: number,
  workspaceNotice: WorkspaceNotice,
): void {
  try {
    // Atomic: the sandbox watcher broadcasts this file to the frontend on
    // every change, and loadQueue/loadPassiveResults re-read it on restart —
    // a torn write could drop the persisted queue.
    writeFileAtomicSync(
      STATS_FILE,
      JSON.stringify({
        ...stats,
        suggestCompactAt,
        queue,
        passiveResults,
        workspaceNotice,
      }),
    );
  } catch {}
}
