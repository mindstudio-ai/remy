import type { ToolDefinition } from '../../../api.js';
import { runMindstudioCli } from '../../common/runMindstudioCli.js';
import { SEARCH_MAX_BUFFER } from '../../common/runCli.js';

/** Results to read page content for. Each one is a full scrape, so this is a cost
 * knob as much as a quality one. */
const FETCH_TOP_N = 5;

export const definition: ToolDefinition = {
  name: 'searchGoogle',
  description:
    'Search Google for web results. Reserch modern design trends in industries or verticals, "best [domain] apps 2026", ui patterns, or find something specific if the the user has an explicit reference. Searching for and reading case studies is a great way to get information and context about a project\'s domain. Prioritize authoritative sources like Figma and other design leaders, avoid random blog spam. The top results come back with their page content already included, so read those directly — only use `scrapeWebUrl` for a result further down the list, or for a URL this did not return.',
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
};

export async function execute(
  input: Record<string, any>,
  onLog?: (line: string) => void,
): Promise<string> {
  return runMindstudioCli(
    [
      'search-google',
      '--query',
      input.query,
      '--export-type',
      'json',
      '--fetch-top-n',
      String(FETCH_TOP_N),
    ],
    {
      outputKey: 'results',
      onLog,
      caller: 'designExpert',
      maxBuffer: SEARCH_MAX_BUFFER,
    },
  );
}
