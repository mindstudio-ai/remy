import type { ToolDefinition } from '../../../api.js';
import { runCli } from '../../common/runCli.js';

export const definition: ToolDefinition = {
  name: 'searchGoogle',
  description:
    'Search Google for web results. Reserch modern design trends in industries or verticals, "best [domain] apps 2026", ui patterns, or find something specific if the the user has an explicit reference. Searching for and reading case studies is a great way to get information and context about a project\'s domain. Prioritize authoritative sources like Figma and other design leaders, avoid random blog spam. Pick one or more URLs from the results and then use `scrapeWebUrl` to get their text content.',
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
  return runCli(
    `mindstudio search-google --query ${JSON.stringify(input.query)} --export-type json --output-key results --no-meta`,
    { onLog },
  );
}
