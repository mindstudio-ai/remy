/**
 * Shared CLI helper — shells out to the mindstudio CLI and returns
 * the stdout output. Used by design expert tools, SDK consultant,
 * and common tools (fetchUrl, searchGoogle).
 */

import { exec } from 'node:child_process';

export function runCli(
  cmd: string,
  options?: { timeout?: number; maxBuffer?: number },
): Promise<string> {
  return new Promise<string>((resolve) => {
    exec(
      cmd,
      {
        timeout: options?.timeout ?? 60_000,
        maxBuffer: options?.maxBuffer ?? 1024 * 1024,
      },
      (err, stdout, stderr) => {
        if (stdout.trim()) {
          resolve(stdout.trim());
          return;
        }
        if (err) {
          resolve(`Error: ${stderr.trim() || err.message}`);
          return;
        }
        resolve('(no response)');
      },
    );
  });
}
