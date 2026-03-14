/** Run a shell command. 30s timeout. Returns stdout + stderr. */

import { exec } from 'node:child_process';
import type { Tool } from './index.js';

const TIMEOUT_MS = 30_000;
const DEFAULT_MAX_LINES = 500;

export const bashTool: Tool = {
  definition: {
    name: 'bash',
    description:
      'Run a shell command and return stdout + stderr. 30-second timeout. Use for: npm install/build/test, git operations, tsc --noEmit, or any CLI tool. Prefer dedicated tools over bash when available (use grep instead of bash + rg, readFile instead of bash + cat). For long-running commands, consider breaking them into smaller steps. Output is truncated to 500 lines by default.',
    inputSchema: {
      type: 'object',
      properties: {
        command: {
          type: 'string',
          description: 'The shell command to execute.',
        },
        maxLines: {
          type: 'number',
          description:
            'Maximum number of output lines to return. Defaults to 500. Set to 0 for no limit.',
        },
      },
      required: ['command'],
    },
  },

  async execute(input) {
    const maxLines =
      input.maxLines === 0 ? Infinity : input.maxLines || DEFAULT_MAX_LINES;

    return new Promise<string>((resolve) => {
      exec(
        input.command,
        { timeout: TIMEOUT_MS, maxBuffer: 2 * 1024 * 1024 },
        (err, stdout, stderr) => {
          let result = '';
          if (stdout) {
            result += stdout;
          }
          if (stderr) {
            result += (result ? '\n' : '') + stderr;
          }
          if (err && !stdout && !stderr) {
            result = `Error: ${err.message}`;
          }
          if (!result) {
            resolve('(no output)');
            return;
          }

          const lines = result.split('\n');
          if (lines.length > maxLines) {
            resolve(
              lines.slice(0, maxLines).join('\n') +
                `\n\n(truncated at ${maxLines} lines of ${lines.length} total — increase maxLines to see more)`,
            );
          } else {
            resolve(result);
          }
        },
      );
    });
  },
};
