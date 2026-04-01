/**
 * Search Google.
 *
 * Shells out to `mindstudio search-google` which calls the
 * underlying SERP API and returns structured results.
 */

import type { Tool } from '../index.js';
import { runCli } from '../../subagents/common/runCli.js';

export const searchGoogleTool: Tool = {
  clearable: false,
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

  async execute(input, context) {
    const query = input.query as string;
    return runCli(
      `mindstudio search-google --query ${JSON.stringify(query)} --export-type json --output-key results --no-meta`,
      { maxBuffer: 512 * 1024, onLog: context?.onLog },
    );
  },
};
