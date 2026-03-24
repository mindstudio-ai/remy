/**
 * Shared CLI helper — shells out to the mindstudio CLI and returns
 * the stdout output. Used by design expert tools, SDK consultant,
 * and common tools (fetchUrl, searchGoogle).
 *
 * Passes --json-logs so the CLI emits structured progress events on
 * stderr. These are collected and prepended to the result so they
 * persist in conversation history (useful for debugging and for the
 * LLM to understand what happened during execution).
 */

import { spawn } from 'node:child_process';

interface CliLogEntry {
  type: string;
  value: string;
  tag?: string;
  ts?: number;
}

export function runCli(
  cmd: string,
  options?: { timeout?: number; maxBuffer?: number; jsonLogs?: boolean },
): Promise<string> {
  return new Promise<string>((resolve) => {
    const timeout = options?.timeout ?? 60_000;
    const maxBuffer = options?.maxBuffer ?? 1024 * 1024;

    // Only inject --json-logs when explicitly opted in
    const cmdWithLogs =
      options?.jsonLogs && !cmd.includes('--json-logs')
        ? cmd.replace(/^(mindstudio\s+\S+)/, '$1 --json-logs')
        : cmd;

    const child = spawn('sh', ['-c', cmdWithLogs], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    const logs: string[] = [];
    let stdout = '';
    let stderr = '';
    let stdoutSize = 0;
    let stderrSize = 0;
    let killed = false;

    child.stdout.on('data', (chunk: Buffer) => {
      stdoutSize += chunk.length;
      if (stdoutSize <= maxBuffer) {
        stdout += chunk.toString();
      } else if (!killed) {
        killed = true;
        child.kill();
      }
    });

    child.stderr.on('data', (chunk: Buffer) => {
      stderrSize += chunk.length;
      if (stderrSize > maxBuffer) {
        if (!killed) {
          killed = true;
          child.kill();
        }
        return;
      }

      const text = chunk.toString();
      stderr += text;

      // Parse JSON log lines from stderr in real-time
      for (const line of text.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed[0] !== '{') {
          continue;
        }
        try {
          const entry: CliLogEntry = JSON.parse(trimmed);
          if (entry.type === 'log' && entry.value) {
            const prefix = entry.tag ? `[${entry.tag}]` : '[log]';
            logs.push(`${prefix} ${entry.value}`);
          }
        } catch {
          // Not a JSON log line — ignore
        }
      }
    });

    const timer = setTimeout(() => {
      killed = true;
      child.kill();
    }, timeout);

    child.on('close', (code) => {
      clearTimeout(timer);

      const logBlock = logs.length > 0 ? logs.join('\n') + '\n\n' : '';
      const out = stdout.trim();

      if (out) {
        resolve(logBlock + out);
        return;
      }
      if (code !== 0 || killed) {
        const errMsg =
          stderr.trim() || (killed ? 'Process timed out' : `Exit code ${code}`);
        resolve(logBlock + `Error: ${errMsg}`);
        return;
      }
      resolve(logBlock + '(no response)');
    });
  });
}
