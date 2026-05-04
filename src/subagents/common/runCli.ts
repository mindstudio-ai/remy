/**
 * Shared CLI helper — spawns the mindstudio CLI directly (no shell) and
 * returns its stdout. Used by design expert tools, SDK consultant, and
 * common tools (scrapeWebUrl, searchGoogle).
 *
 * Args are passed as a string[] to spawn() and never go through `sh -c`,
 * so user-supplied content (queries, URLs, prompts) is safe regardless of
 * what shell metacharacters it contains. Backticks, dollar signs, quotes,
 * etc. are all literal.
 *
 * Passes --json-logs (when opted in) so the CLI emits structured progress
 * events on stderr. When an `onLog` callback is provided, log lines are
 * streamed in real-time and omitted from the final result. Without `onLog`,
 * logs are accumulated and prepended to the result (legacy behavior).
 */

import { spawn } from 'node:child_process';

interface CliLogEntry {
  type: string;
  value: string;
  tag?: string;
  ts?: number;
}

export interface RunCliOptions {
  timeout?: number;
  maxBuffer?: number;
  jsonLogs?: boolean;
  /** Called for each parsed log line as it arrives on stderr. */
  onLog?: (line: string) => void;
  /** Data to pipe to stdin. */
  stdin?: string;
}

export function runCli(
  command: string,
  args: string[],
  options?: RunCliOptions,
): Promise<string> {
  return new Promise<string>((resolve) => {
    const timeout = options?.timeout ?? 60_000;
    const maxBuffer = options?.maxBuffer ?? 1024 * 1024;

    // Inject --json-logs right after the subcommand (args[0]) when opted in.
    let finalArgs = args;
    if (options?.jsonLogs && !args.includes('--json-logs')) {
      finalArgs =
        args.length > 0
          ? [args[0], '--json-logs', ...args.slice(1)]
          : ['--json-logs'];
    }

    const child = spawn(command, finalArgs, {
      stdio: [options?.stdin ? 'pipe' : 'ignore', 'pipe', 'pipe'],
    });

    if (options?.stdin) {
      child.stdin!.write(options.stdin);
      child.stdin!.end();
    }

    const logs: string[] = [];
    let stdout = '';
    let stderr = '';
    let stdoutSize = 0;
    let stderrSize = 0;
    let killed = false;

    child.stdout!.on('data', (chunk: Buffer) => {
      stdoutSize += chunk.length;
      if (stdoutSize <= maxBuffer) {
        stdout += chunk.toString();
      } else if (!killed) {
        killed = true;
        child.kill();
      }
    });

    child.stderr!.on('data', (chunk: Buffer) => {
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
            const formatted = `${prefix} ${entry.value}`;
            if (options?.onLog) {
              options.onLog(formatted);
            } else {
              logs.push(formatted);
            }
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

      // When onLog is provided, logs were already streamed — don't prepend.
      const logBlock =
        !options?.onLog && logs.length > 0 ? logs.join('\n') + '\n\n' : '';
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
