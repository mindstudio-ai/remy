/**
 * Shared browser lock and status check.
 *
 * The browser is a single physical resource — screenshots and automation
 * sessions must not run concurrently. This module provides a FIFO lock
 * and a fast connection check so callers fail immediately when the
 * browser isn't connected instead of waiting for a 120s timeout.
 */

import { sidecarRequest } from './sidecar.js';

// FIFO queue — each caller waits for the previous holder to release.
let lockQueue: Promise<void> = Promise.resolve();

export function acquireBrowserLock(): Promise<() => void> {
  let release!: () => void;
  const next = new Promise<void>((res) => {
    release = res;
  });
  const wait = lockQueue;
  lockQueue = next;
  return wait.then(() => release);
}

export async function checkBrowserConnected(): Promise<{
  connected: boolean;
  /** Human-readable reason when not connected. Already phrased as a status, not an error — callers should return it as-is without prefixing "Error:". */
  reason?: string;
}> {
  try {
    const status = await sidecarRequest(
      '/browser-status',
      {},
      { timeout: 5000 },
    );
    if (!status.connected) {
      return {
        connected: false,
        reason: BROWSER_UNAVAILABLE_MESSAGE,
      };
    }
    return { connected: true };
  } catch {
    return {
      connected: false,
      reason: BROWSER_UNAVAILABLE_MESSAGE,
    };
  }
}

/**
 * Canonical "browser unavailable" message. Deliberately does NOT start with
 * "Error:" so the agent layer (`agent.ts` sets `isError` from that prefix)
 * treats this as an informational result, not a tool failure. Unavailability
 * means the user has closed their browser and we are continuing to work in
 * the background — nothing for the agent to diagnose or guide the user through.
 */
export const BROWSER_UNAVAILABLE_MESSAGE =
  'Browser preview unavailable — the user has closed their browser and we are continuing to work in the background. This is not a code failure and not something to diagnose. Do not tell the user to click or open anything. Skip the visual check and verify your work through other means: runMethod for backend behavior, queryDatabase for data checks, .logs/devServer.ndjson for build errors, .logs/browser.ndjson for runtime errors, lspDiagnostics for type/syntax, or read the code directly.';
