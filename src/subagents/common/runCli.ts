/**
 * Shared CLI helper — spawns the mindstudio CLI directly (no shell) and
 * returns a structured result. Used by the SDK consultant, design expert
 * tools, and common tools (scrapeWebUrl, searchGoogle).
 *
 * Args are passed as a string[] to spawn() and never go through `sh -c`,
 * so user-supplied content (queries, URLs, prompts) is safe regardless of
 * what shell metacharacters it contains. Backticks, dollar signs, quotes,
 * etc. are all literal.
 *
 * Passes --json-logs (when opted in) so the CLI emits structured progress
 * events on stderr. When an `onLog` callback is provided, log lines are
 * streamed in real-time and omitted from `result.logs`. Without `onLog`,
 * logs are accumulated into `result.logs`.
 *
 * The returned promise ALWAYS resolves — never rejects. Every failure mode
 * (spawn error such as ENOENT, non-zero exit, timeout, empty output) is
 * reported via `result.ok === false` with a human-readable `result.output`.
 * Use `formatCliResult` to collapse a result back into the flat string that
 * model-facing tools surface.
 */

import { spawn } from 'node:child_process';

/** Default stdout/stderr cap for a scrape (largest expected CLI output). */
export const SCRAPE_MAX_BUFFER = 4 * 1024 * 1024;
/** Default stdout/stderr cap for a web search. */
export const SEARCH_MAX_BUFFER = 512 * 1024;

/** Grace period after SIGTERM before escalating to SIGKILL on timeout. */
const SIGKILL_GRACE_MS = 2_000;

interface CliLogEntry {
  type: string;
  value: string;
  tag?: string;
  ts?: number;
}

export interface CliResult {
  /** True when the CLI produced usable stdout. False on spawn error,
   *  timeout, non-zero exit with no output, or clean exit with no output. */
  ok: boolean;
  /** stdout (trimmed) when ok; a human-readable error message otherwise. */
  output: string;
  /** Formatted CLI log lines (empty when `onLog` streamed them live). */
  logs: string[];
  /** True when the process was killed by the timeout. */
  timedOut: boolean;
  /** True when stdout/stderr exceeded maxBuffer and was cut off. */
  truncated: boolean;
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

/** Collapse a CliResult into the flat string that model-facing tools return:
 *  log block, then either the output or an `Error: …` line, then a truncation
 *  marker when the output was cut off. */
export function formatCliResult(r: CliResult): string {
  const logBlock = r.logs.length > 0 ? r.logs.join('\n') + '\n\n' : '';
  const body = r.ok ? r.output : `Error: ${r.output}`;
  const truncNote = r.truncated ? '\n\n[output truncated]' : '';
  return logBlock + body + truncNote;
}

export function runCli(
  command: string,
  args: string[],
  options?: RunCliOptions,
): Promise<CliResult> {
  return new Promise<CliResult>((resolve) => {
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

    const logs: string[] = [];
    let stdout = '';
    let stderr = '';
    let stdoutSize = 0;
    let stderrSize = 0;
    let killed = false;
    let timedOut = false;
    let truncated = false;
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let killTimer: ReturnType<typeof setTimeout> | undefined;

    const finish = (result: CliResult) => {
      if (settled) {
        return;
      }
      settled = true;
      if (timer) {
        clearTimeout(timer);
      }
      if (killTimer) {
        clearTimeout(killTimer);
      }
      resolve(result);
    };

    const child = spawn(command, finalArgs, {
      stdio: [options?.stdin ? 'pipe' : 'ignore', 'pipe', 'pipe'],
    });

    // Spawn-level failure (ENOENT when the binary isn't on PATH, EACCES,
    // EMFILE, …). Without this handler the 'error' event throws as an
    // uncaughtException and 'close' never fires, hanging the promise forever.
    child.on('error', (err: Error) => {
      finish({
        ok: false,
        output: err.message,
        logs,
        timedOut: false,
        truncated: false,
      });
    });

    if (options?.stdin) {
      // The child may exit before we finish writing (EPIPE). Swallow it — the
      // 'error'/'close' handlers already resolve with the real outcome.
      child.stdin!.on('error', () => {});
      try {
        child.stdin!.write(options.stdin);
        child.stdin!.end();
      } catch {
        // Broken pipe — ignore; outcome comes from close/error.
      }
    }

    const killForOverflow = () => {
      if (killed) {
        return;
      }
      killed = true;
      truncated = true;
      child.kill();
    };

    child.stdout!.on('data', (chunk: Buffer) => {
      stdoutSize += chunk.length;
      if (stdoutSize <= maxBuffer) {
        stdout += chunk.toString();
      } else {
        killForOverflow();
      }
    });

    child.stderr!.on('data', (chunk: Buffer) => {
      stderrSize += chunk.length;
      if (stderrSize > maxBuffer) {
        killForOverflow();
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

    timer = setTimeout(() => {
      if (killed) {
        return;
      }
      killed = true;
      timedOut = true;
      child.kill(); // SIGTERM
      // Escalate if the child ignores SIGTERM.
      killTimer = setTimeout(() => child.kill('SIGKILL'), SIGKILL_GRACE_MS);
    }, timeout);

    child.on('close', (code) => {
      const out = stdout.trim();

      if (timedOut) {
        finish({
          ok: false,
          output: stderr.trim() || 'Process timed out',
          logs,
          timedOut: true,
          truncated,
        });
        return;
      }
      // Partial stdout past maxBuffer is still usable — surface it as a
      // truncated success rather than an error.
      if (out) {
        finish({ ok: true, output: out, logs, timedOut: false, truncated });
        return;
      }
      finish({
        ok: false,
        output:
          stderr.trim() || (code !== 0 ? `Exit code ${code}` : '(no response)'),
        logs,
        timedOut: false,
        truncated,
      });
    });
  });
}
