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
  error?: string;
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
        error:
          'The browser preview is not connected. The user needs to open the preview.',
      };
    }
    return { connected: true };
  } catch (err: any) {
    return {
      connected: false,
      error:
        err?.message ||
        'Could not check browser status. The dev environment may not be running.',
    };
  }
}
