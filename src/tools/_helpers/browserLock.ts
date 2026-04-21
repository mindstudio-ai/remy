/**
 * Shared browser lock.
 *
 * The browser is a single physical resource — screenshots and automation
 * sessions must not run concurrently. This module provides a FIFO lock.
 */

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
