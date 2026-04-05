/**
 * Per-file async mutex.
 *
 * Serializes concurrent operations on the same file path.
 * Different files still run in parallel. The lock is process-wide
 * (module-level map) so it covers all tool calls within a session.
 */

const locks = new Map<string, Promise<void>>();

/**
 * Acquire an exclusive lock for a file path.
 * Returns a release function — call it when done (use try/finally).
 */
export function acquireFileLock(filePath: string): Promise<() => void> {
  let release!: () => void;
  const next = new Promise<void>((res) => {
    release = res;
  });
  const wait = locks.get(filePath) ?? Promise.resolve();
  locks.set(filePath, next);
  return wait.then(() => release);
}
