/** Search file contents. Uses ripgrep if available, falls back to grep. */

import { execFile } from 'node:child_process';
import type { Tool } from '../index.js';

const DEFAULT_MAX = 50;

type OutputMode = 'content' | 'count' | 'filesWithMatches';

/** Coerce a numeric input to an integer clamped to [0, 100]. */
function clampContext(v: unknown): number {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : 0;
}

function formatResults(stdout: string, max: number, mode: OutputMode): string {
  const trimmed = stdout.trim();
  // count / filesWithMatches return one line per file, not "matching lines" —
  // the per-match truncation note doesn't apply, so return them as-is.
  if (mode !== 'content') {
    return trimmed;
  }
  const lines = trimmed.split('\n');
  let result = lines.join('\n');
  if (lines.length >= max) {
    result += `\n\n(truncated at ${max} results — increase maxResults to see more)`;
  }
  return result;
}

export const grepTool: Tool = {
  definition: {
    name: 'grep',
    description:
      "Search file contents for a regex pattern. Returns matching lines with file paths and line numbers (default 50 results). Use this to find where something is used, locate function definitions, or search for patterns across the codebase. Set outputMode to 'count' for per-file match counts (like grep -c) or 'filesWithMatches' for just the file paths (like grep -l). Add context (like grep -C), or contextBefore/contextAfter (like grep -B/-A), to include surrounding lines. Set caseInsensitive (like grep -i) for a case-insensitive search. For finding a symbol's definition precisely, prefer the definition tool if LSP is available. Automatically excludes node_modules and .git.",
    inputSchema: {
      type: 'object',
      properties: {
        pattern: {
          type: 'string',
          description: 'The search pattern (regex supported).',
        },
        path: {
          type: 'string',
          description:
            'Directory or file to search in. Defaults to current directory.',
        },
        glob: {
          type: 'string',
          description:
            'File glob to filter (e.g., "*.ts"). Only used with ripgrep.',
        },
        maxResults: {
          type: 'number',
          description:
            'Maximum number of matching lines to return. Defaults to 50. Increase if you need more comprehensive results.',
        },
        outputMode: {
          type: 'string',
          enum: ['content', 'count', 'filesWithMatches'],
          description:
            "What to return. 'content' (default): matching lines with line numbers. 'count': number of matches per file, like grep -c. 'filesWithMatches': just the paths of files that contain a match, like grep -l.",
        },
        context: {
          type: 'number',
          description:
            'Lines of context to show before AND after each match, like grep -C. Content mode only.',
        },
        contextBefore: {
          type: 'number',
          description:
            'Lines of context before each match, like grep -B. Content mode only; ignored if context is set.',
        },
        contextAfter: {
          type: 'number',
          description:
            'Lines of context after each match, like grep -A. Content mode only; ignored if context is set.',
        },
        caseInsensitive: {
          type: 'boolean',
          description: 'Case-insensitive search, like grep -i.',
        },
      },
      required: ['pattern'],
    },
  },

  async execute(input) {
    const searchPath = input.path || '.';
    const max = Math.max(
      1,
      Math.floor(Number(input.maxResults) || DEFAULT_MAX),
    );

    const mode: OutputMode =
      input.outputMode === 'count' || input.outputMode === 'filesWithMatches'
        ? input.outputMode
        : 'content';

    // Context flags apply to content mode only. `context` (-C) wins over the
    // before/after pair.
    const ctx: string[] = [];
    if (mode === 'content') {
      if (input.context != null) {
        const c = clampContext(input.context);
        if (c > 0) {
          ctx.push('-C', String(c));
        }
      } else {
        const b =
          input.contextBefore != null ? clampContext(input.contextBefore) : 0;
        const a =
          input.contextAfter != null ? clampContext(input.contextAfter) : 0;
        if (b > 0) {
          ctx.push('-B', String(b));
        }
        if (a > 0) {
          ctx.push('-A', String(a));
        }
      }
    }

    // Build the mode-specific flag core for each engine.
    const ci = input.caseInsensitive ? ['-i'] : [];
    let rgFlags: string[];
    let grepFlags: string[];
    if (mode === 'count') {
      rgFlags = ['--count', ...ci];
      grepFlags = ['-rc', ...ci];
    } else if (mode === 'filesWithMatches') {
      rgFlags = ['-l', ...ci];
      grepFlags = ['-rl', ...ci];
    } else {
      rgFlags = ['-n', '--no-heading', ...ci, ...ctx, `--max-count=${max}`];
      grepFlags = ['-rn', ...ci, ...ctx, `--max-count=${max}`];
    }

    // Args are passed as an array (no shell), so paths with spaces or quotes
    // can't split or inject. The `--` keeps a pattern or path that starts with
    // `-` from being parsed as a flag. This tool once built a shell string with
    // the path unquoted: a Windows-style upload dir ("app - Copy") shell-split
    // into a bare `-`, which means read-stdin — and with stdin an open pipe
    // and no timeout, rg blocked forever and wedged the whole agent.
    const rgArgs = [
      ...rgFlags,
      ...(input.glob ? ['--glob', input.glob] : []),
      '--',
      input.pattern,
      searchPath,
    ];
    const grepArgs = [
      ...grepFlags,
      '--exclude-dir=node_modules',
      '--exclude-dir=.git',
      '--include=*.ts',
      '--include=*.tsx',
      '--include=*.js',
      '--include=*.json',
      '--include=*.md',
      '--',
      input.pattern,
      searchPath,
    ];

    // Bounded run: hard timeout, and stdin closed immediately so a literal
    // `-` path gets instant EOF instead of blocking on a pipe that never ends.
    const run = (
      cmd: string,
      cmdArgs: string[],
    ): Promise<{ stdout: string; timedOut: boolean }> =>
      new Promise((resolve) => {
        const child = execFile(
          cmd,
          cmdArgs,
          { maxBuffer: 512 * 1024, timeout: 30_000 },
          (err, stdout) => {
            resolve({
              stdout: stdout ?? '',
              timedOut: err?.killed === true,
            });
          },
        );
        child.stdin?.end();
      });

    // Try ripgrep first, fall back to grep.
    const rg = await run('rg', rgArgs);
    if (rg.stdout.trim()) {
      return formatResults(rg.stdout, max, mode);
    }
    if (rg.timedOut) {
      return `Error: search timed out after 30s in ${searchPath} — narrow the path or pattern.`;
    }

    const grep = await run('grep', grepArgs);
    if (grep.stdout.trim()) {
      return formatResults(grep.stdout, max, mode);
    }
    if (grep.timedOut) {
      return `Error: search timed out after 30s in ${searchPath} — narrow the path or pattern.`;
    }
    return 'No matches found.';
  },
};
