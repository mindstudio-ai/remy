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
    description: `An expert consultant on building with the MindStudio SDK. Knows every action, model, connector, and configuration option. Use this as an architect, not just a docs lookup:

- Describe what you're trying to build at the method level ("I need a method that takes user text, generates a summary with GPT, extracts entities, and returns structured JSON") and get back architectural guidance + working code.
- Ask about AI orchestration patterns: structured output, chaining model calls, batch processing, streaming, error handling.
- Ask about connectors and integrations: what's available, whether the user has configured it, how to use it.
- Always use this before writing SDK code. Model IDs, config options, and action signatures change frequently. Don't guess.

Batch related questions into a single query. This runs its own LLM call so it has a few seconds of latency.`,
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description:
            'Describe what you want to build or what you need to know. Be specific about the goal, not just the API method.',
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
