/** Search file contents. Uses ripgrep if available, falls back to grep. */

import { exec } from 'node:child_process';
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
    const globFlag = input.glob ? ` --glob '${input.glob}'` : '';
    const escaped = input.pattern.replace(/'/g, "'\\''");

    const mode: OutputMode =
      input.outputMode === 'count' || input.outputMode === 'filesWithMatches'
        ? input.outputMode
        : 'content';
    const ci = input.caseInsensitive ? ' -i' : '';

    // Context flags apply to content mode only. `context` (-C) wins over the
    // before/after pair. All values are clamped ints, so safe to interpolate.
    let ctx = '';
    if (mode === 'content') {
      if (input.context != null) {
        const c = clampContext(input.context);
        if (c > 0) {
          ctx = ` -C ${c}`;
        }
      } else {
        const b =
          input.contextBefore != null ? clampContext(input.contextBefore) : 0;
        const a =
          input.contextAfter != null ? clampContext(input.contextAfter) : 0;
        if (b > 0) {
          ctx += ` -B ${b}`;
        }
        if (a > 0) {
          ctx += ` -A ${a}`;
        }
      }
    }

    // Build the mode-specific flag core for each engine.
    let rgFlags: string;
    let grepFlags: string;
    if (mode === 'count') {
      rgFlags = `--count${ci}`;
      grepFlags = `-rc${ci}`;
    } else if (mode === 'filesWithMatches') {
      rgFlags = `-l${ci}`;
      grepFlags = `-rl${ci}`;
    } else {
      rgFlags = `-n --no-heading${ci}${ctx} --max-count=${max}`;
      grepFlags = `-rn${ci}${ctx} --max-count=${max}`;
    }

    // Try ripgrep first, fall back to grep.
    const rgCmd = `rg ${rgFlags}${globFlag} '${escaped}' ${searchPath}`;
    const grepCmd = `grep ${grepFlags} '${escaped}' ${searchPath} --include='*.ts' --include='*.tsx' --include='*.js' --include='*.json' --include='*.md'`;

    return new Promise<string>((resolve) => {
      exec(rgCmd, { maxBuffer: 512 * 1024 }, (err, stdout) => {
        if (stdout?.trim()) {
          resolve(formatResults(stdout, max, mode));
          return;
        }

        // Fallback to grep
        exec(grepCmd, { maxBuffer: 512 * 1024 }, (_err, grepStdout) => {
          if (grepStdout?.trim()) {
            resolve(formatResults(grepStdout, max, mode));
          } else {
            resolve('No matches found.');
          }
        });
      });
    });
  },
};
