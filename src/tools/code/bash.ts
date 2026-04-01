/** Run a shell command. 120s timeout by default. Returns stdout + stderr. */

import { exec } from 'node:child_process';
import type { Tool } from '../index.js';

const DEFAULT_TIMEOUT_MS = 120_000;
const DEFAULT_MAX_LINES = 500;

export const bashTool: Tool = {
  clearable: true,
  definition: {
    name: 'bash',
    description:
      'Run a shell command and return stdout + stderr. 120-second timeout by default (configurable). Use for: npm install/build/test, git operations, tsc --noEmit, or any CLI tool. Prefer dedicated tools over bash when available (use grep instead of bash + rg, readFile instead of bash + cat). Output is truncated to 500 lines by default.',
    inputSchema: {
      type: 'object',
      properties: {
        command: {
          type: 'string',
          description: 'The shell command to execute.',
        },
        cwd: {
          type: 'string',
          description:
            'Working directory to run the command in. Defaults to the project root.',
        },
        timeout: {
          type: 'number',
          description:
            'Timeout in seconds. Defaults to 120. Use higher values for long-running commands like builds or test suites.',
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
    const timeoutMs = input.timeout ? input.timeout * 1000 : DEFAULT_TIMEOUT_MS;

    return new Promise<string>((resolve) => {
      exec(
        input.command,
        {
          timeout: timeoutMs,
          maxBuffer: 2 * 1024 * 1024,
          ...(input.cwd ? { cwd: input.cwd } : {}),
          env: { ...process.env, FORCE_COLOR: '1' },
        },
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
