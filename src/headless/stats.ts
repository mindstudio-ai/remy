/**
 * Session stats persistence for the headless protocol.
 *
 * Writes .remy-stats.json with cumulative turn/token stats plus the
 * message queue so queued work survives process restarts.
 */

import { readFileSync, writeFileSync } from 'node:fs';
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

/** Persist stats + queue to disk. Best-effort (swallows errors). */
export function writeStats(stats: SessionStats, queue: QueuedMessage[]): void {
  try {
    writeFileSync(
      STATS_FILE,
      JSON.stringify({
        ...stats,
        queue,
      }),
    );
  } catch {}
}
