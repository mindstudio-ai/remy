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

/** Persist stats + queue + passive pen to disk. Best-effort (swallows errors). */
export function writeStats(
  stats: SessionStats,
  queue: QueuedMessage[],
  passiveResults: PassiveResult[],
): void {
  try {
    writeFileSync(
      STATS_FILE,
      JSON.stringify({
        ...stats,
        queue,
        passiveResults,
      }),
    );
  } catch {}
}
