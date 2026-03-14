/** Search file contents. Uses ripgrep if available, falls back to grep. */

import { exec } from 'node:child_process';
import type { Tool } from './index.js';

const DEFAULT_MAX = 50;

export const grepTool: Tool = {
  definition: {
    name: 'grep',
    description:
      "Search file contents for a regex pattern. Returns matching lines with file paths and line numbers (default 50 results). Use this to find where something is used, locate function definitions, or search for patterns across the codebase. For finding a symbol's definition precisely, prefer the definition tool if LSP is available. Automatically excludes node_modules and .git.",
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
      },
      required: ['pattern'],
    },
  },

  async execute(input) {
    const searchPath = input.path || '.';
    const max = input.maxResults || DEFAULT_MAX;
    const globFlag = input.glob ? ` --glob '${input.glob}'` : '';
    const escaped = input.pattern.replace(/'/g, "'\\''");

    // Try ripgrep first, fall back to grep
    const rgCmd = `rg -n --no-heading --max-count=${max}${globFlag} '${escaped}' ${searchPath}`;
    const grepCmd = `grep -rn --max-count=${max} '${escaped}' ${searchPath} --include='*.ts' --include='*.tsx' --include='*.js' --include='*.json' --include='*.md'`;

    return new Promise<string>((resolve) => {
      exec(rgCmd, { maxBuffer: 512 * 1024 }, (err, stdout) => {
        if (stdout?.trim()) {
          const lines = stdout.trim().split('\n');
          let result = lines.join('\n');
          if (lines.length >= max) {
            result += `\n\n(truncated at ${max} results — increase maxResults to see more)`;
          }
          resolve(result);
          return;
        }

        // Fallback to grep
        exec(grepCmd, { maxBuffer: 512 * 1024 }, (_err, grepStdout) => {
          if (grepStdout?.trim()) {
            const lines = grepStdout.trim().split('\n');
            let result = lines.join('\n');
            if (lines.length >= max) {
              result += `\n\n(truncated at ${max} results — increase maxResults to see more)`;
            }
            resolve(result);
          } else {
            resolve('No matches found.');
          }
        });
      });
    });
  },
};
