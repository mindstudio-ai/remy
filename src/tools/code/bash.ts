/** Run a shell command with streaming output. 120s timeout by default. Returns stdout + stderr. */

import { spawn } from 'node:child_process';
import type { Tool, ToolExecutionContext } from '../index.js';

const DEFAULT_TIMEOUT_MS = 120_000;
const DEFAULT_MAX_LINES = 500;
// Byte cap on output. Line caps don't help when single lines are huge
// (NDJSON, minified JS, base64), where a few hundred lines can be megabytes
// and blow the model's context. Pair the line cap with a hard byte limit.
const MAX_OUTPUT_BYTES = 30_000;

export const bashTool: Tool = {
  clearable: true,
  definition: {
    name: 'bash',
    description:
      'Run a shell command and return stdout + stderr. 120-second timeout by default (configurable). Use for: npm install/build/test, git operations, tsc --noEmit, or any CLI tool. Prefer dedicated tools over bash when available (use grep instead of bash + rg, readFile instead of bash + cat). Output is truncated to 500 lines or 30KB, whichever comes first. If a command would emit a lot of data, narrow it down (grep, head/tail, --short flags) rather than reading everything.',
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

        const totalBytes = Buffer.byteLength(output, 'utf-8');
        let truncated = output;
        let byteTruncated = false;
        if (totalBytes > MAX_OUTPUT_BYTES) {
          truncated = Buffer.from(output, 'utf-8')
            .subarray(0, MAX_OUTPUT_BYTES)
            .toString('utf-8');
          byteTruncated = true;
        }

        const lines = truncated.split('\n');
        const lineTruncated = lines.length > maxLines;
        if (lineTruncated) {
          truncated = lines.slice(0, maxLines).join('\n');
        }

        if (byteTruncated || lineTruncated) {
          const reasons: string[] = [];
          if (lineTruncated) {
            reasons.push(`${maxLines} lines`);
          }
          if (byteTruncated) {
            reasons.push(
              `${(MAX_OUTPUT_BYTES / 1024).toFixed(0)}KB of ${(totalBytes / 1024).toFixed(0)}KB`,
            );
          }
          resolve(
            truncated +
              `\n\n(truncated at ${reasons.join(' / ')} — narrow the command (grep, head/tail, smaller paths) instead of increasing limits)`,
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
