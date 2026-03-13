/** Search file contents. Uses ripgrep if available, falls back to grep. */

import { exec } from 'node:child_process';
import type { Tool } from './index.js';

export const grepTool: Tool = {
  definition: {
    name: 'grep',
    description:
      'Search file contents for a pattern. Returns matching lines with file paths and line numbers. Uses ripgrep if available, falls back to grep.',
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
      },
      required: ['pattern'],
    },
  },

  async execute(input) {
    const searchPath = input.path || '.';
    const globFlag = input.glob ? ` --glob '${input.glob}'` : '';

    // Try ripgrep first, fall back to grep
    const rgCmd = `rg -n --no-heading --max-count=50${globFlag} '${input.pattern.replace(/'/g, "'\\''")}' ${searchPath}`;
    const grepCmd = `grep -rn --max-count=50 '${input.pattern.replace(/'/g, "'\\''")}' ${searchPath} --include='*.ts' --include='*.tsx' --include='*.js' --include='*.json' --include='*.md'`;

    return new Promise<string>((resolve) => {
      exec(rgCmd, { maxBuffer: 512 * 1024 }, (err, stdout) => {
        if (stdout?.trim()) {
          resolve(stdout.trim());
          return;
        }

        // Fallback to grep
        exec(grepCmd, { maxBuffer: 512 * 1024 }, (_err, grepStdout) => {
          resolve(grepStdout?.trim() || 'No matches found.');
        });
      });
    });
  },
};
