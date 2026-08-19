/**
 * Search Google.
 *
 * Shells out to `mindstudio search-google` which calls the
 * underlying SERP API and returns structured results.
 */

import type { Tool } from '../index.js';
import { runMindstudioCli } from '../../subagents/common/runMindstudioCli.js';
import { SEARCH_MAX_BUFFER } from '../../subagents/common/runCli.js';

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

  async execute(input, context) {
    const query = input.query as string;
    return runMindstudioCli(
      ['search-google', '--query', query, '--export-type', 'json'],
      {
        outputKey: 'results',
        maxBuffer: SEARCH_MAX_BUFFER,
        onLog: context?.onLog,
        caller: 'parent',
      },
    );
  },
};
