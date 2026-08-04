/**
 * Spec-sync lock.
 *
 * The spec-sync specialist always runs in the background, and we never want two
 * reconciliations editing src/ at once. This FIFO lock serializes them: a second
 * dispatch queues behind the first (the runner acquires it inside the detached
 * work — see runner.ts `acquireLock`) rather than running concurrently or erroring.
 */

// FIFO queue — each caller waits for the previous holder to release.
let lockQueue: Promise<void> = Promise.resolve();

export function acquireSpecSyncLock(): Promise<() => void> {
  let release!: () => void;
  const next = new Promise<void>((res) => {
    release = res;
  });
  const wait = lockQueue;
  lockQueue = next;
  return wait.then(() => release);
}
