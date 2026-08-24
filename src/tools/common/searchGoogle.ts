/**
 * Search Google.
 *
 * Shells out to `mindstudio search-google` which calls the
 * underlying SERP API and returns structured results.
 *
 * `--fetch-top-n` makes the platform read the top results' page content in the
 * same call, so the model gets the text of the leading hits without a round trip
 * per result. Kept on by default: measured agent traces need ~6.8 tool calls to
 * answer from links alone against ~4.8 when content comes back inline, and each of
 * those saved calls is a full model turn.
 */

import type { Tool } from '../index.js';
import { runMindstudioCli } from '../../subagents/common/runMindstudioCli.js';
import { SEARCH_MAX_BUFFER } from '../../subagents/common/runCli.js';

/** Results to read page content for. Each one is a full scrape, so this is a cost
 * knob as much as a quality one. */
const FETCH_TOP_N = 5;

export const searchGoogleTool: Tool = {
  definition: {
    name: 'searchGoogle',
    description:
      'Search Google and return results. Use for research, finding documentation, looking up APIs, or any task where web search would help. The top results come back with their page content already included, so read those before reaching for scrapeWebUrl — you only need that for URLs this did not return, or for a result further down the list.',
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
      [
        'search-google',
        '--query',
        query,
        '--export-type',
        'json',
        '--fetch-top-n',
        String(FETCH_TOP_N),
      ],
      {
        outputKey: 'results',
        maxBuffer: SEARCH_MAX_BUFFER,
        onLog: context?.onLog,
        caller: 'parent',
      },
    );
  },
};
