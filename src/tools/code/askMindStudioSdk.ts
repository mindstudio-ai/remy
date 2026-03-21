/**
 * Query the MindStudio SDK assistant for action signatures, model IDs,
 * connector details, and code examples.
 *
 * Shells out to `mindstudio ask` which runs its own agent loop.
 * Available when the mindstudio CLI is installed (sandbox, or globally).
 */

import { exec } from 'node:child_process';
import type { Tool } from '../index.js';

export const askMindStudioSdkTool: Tool = {
  definition: {
    name: 'askMindStudioSdk',
    description:
      'Ask the MindStudio SDK assistant about available actions, AI models, connectors, and integrations using natural language. Returns code examples with correct method signatures, model IDs, and config options. Always use this to verify correct SDK usage, especially model IDs and configuration options. Describe what you need, not what API methods you need; the assistant will figure out the right approach. This runs its own LLM call so it has a few seconds of latency; batch multiple questions into a single query.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Natural language question about the SDK.',
        },
      },
      required: ['query'],
    },
  },

  async execute(input) {
    const query = input.query as string;

    return new Promise<string>((resolve) => {
      exec(
        `mindstudio ask ${JSON.stringify(query)}`,
        { timeout: 60_000, maxBuffer: 512 * 1024 },
        (err, stdout, stderr) => {
          if (stdout.trim()) {
            resolve(stdout.trim());
            return;
          }
          if (err) {
            resolve(`Error: ${stderr.trim() || err.message}`);
            return;
          }
          resolve('(no response)');
        },
      );
    });
  },
};
