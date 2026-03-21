/**
 * Search Google.
 *
 * Shells out to `mindstudio search-google` which calls the
 * underlying SERP API and returns structured results.
 */

import { exec } from 'node:child_process';
import type { Tool } from '../index.js';

export const searchGoogleTool: Tool = {
  definition: {
    name: 'searchGoogle',
    description:
      'Search Google and return results. Use for research, finding documentation, looking up APIs, or any task where web search would help.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'The search query.',
        },
      },
      required: ['query'],
    },
  },

  async execute(input) {
    const query = input.query as string;

    const cmd = `mindstudio search-google --query ${JSON.stringify(query)} --export-type json --output-key results --no-meta`;

    return new Promise<string>((resolve) => {
      exec(
        cmd,
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
