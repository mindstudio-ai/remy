/** Run a shell command with streaming output. 120s timeout by default. Returns stdout + stderr. */

import { spawn } from 'node:child_process';
import type { Tool, ToolExecutionContext } from '../index.js';

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

  async execute(input, context?: ToolExecutionContext) {
    const maxLines =
      input.maxLines === 0 ? Infinity : input.maxLines || DEFAULT_MAX_LINES;
    const timeoutMs = input.timeout ? input.timeout * 1000 : DEFAULT_TIMEOUT_MS;

    return new Promise<string>((resolve) => {
      const child = spawn('sh', ['-c', input.command], {
        cwd: input.cwd || undefined,
        env: { ...process.env, FORCE_COLOR: '1' },
      });

      let output = '';

      child.stdout.on('data', (chunk: Buffer) => {
        const text = chunk.toString();
        output += text;
        context?.onLog?.(text);
      });

      child.stderr.on('data', (chunk: Buffer) => {
        const text = chunk.toString();
        output += text;
        context?.onLog?.(text);
      });

      const timer = setTimeout(() => {
        child.kill('SIGTERM');
      }, timeoutMs);

      child.on('close', (code) => {
        clearTimeout(timer);

        if (!output) {
          if (code && code !== 0) {
            resolve(`Error: process exited with code ${code}`);
          } else {
            resolve('(no output)');
          }
          return;
        }

        const lines = output.split('\n');
        if (lines.length > maxLines) {
          resolve(
            lines.slice(0, maxLines).join('\n') +
              `\n\n(truncated at ${maxLines} lines of ${lines.length} total — increase maxLines to see more)`,
          );
        } else {
          resolve(output);
        }
      });

      child.on('error', (err) => {
        clearTimeout(timer);
        resolve(`Error: ${err.message}`);
      });
    });
  },
};
