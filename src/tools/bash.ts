/** Run a shell command. 30s timeout. Returns stdout + stderr. */

import { exec } from 'node:child_process';
import type { Tool } from './index.js';

const TIMEOUT_MS = 30_000;

export const bashTool: Tool = {
  definition: {
    name: 'bash',
    description:
      'Run a shell command and return stdout + stderr. Use for running builds, typechecks, git operations, or any CLI tool. Working directory is the project root.',
    inputSchema: {
      type: 'object',
      properties: {
        command: {
          type: 'string',
          description: 'The shell command to execute.',
        },
      },
      required: ['command'],
    },
  },

  async execute(input) {
    return new Promise<string>((resolve) => {
      exec(
        input.command,
        { timeout: TIMEOUT_MS, maxBuffer: 1024 * 1024 },
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
          resolve(result || '(no output)');
        },
      );
    });
  },
};
