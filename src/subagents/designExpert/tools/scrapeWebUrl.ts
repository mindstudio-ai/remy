import type { ToolDefinition } from '../../../api.js';
import { runMindstudioCli } from '../../common/runMindstudioCli.js';

export const definition: ToolDefinition = {
  clearable: false,
  name: 'scrapeWebUrl',
  description:
    'Fetch the content of a web page as markdown. Use when reading sites from search results or specific things the user wants to incorporate.',
  inputSchema: {
    type: 'object',
    properties: {
      url: {
        type: 'string',
        description: 'The URL to fetch.',
      },
    },
    required: ['url'],
  },
};

export async function execute(
  input: Record<string, any>,
  onLog?: (line: string) => void,
): Promise<string> {
  const pageOptions: Record<string, any> = { onlyMainContent: true };
  if (input.screenshot) {
    pageOptions.screenshot = true;
  }
  return runMindstudioCli(
    [
      'scrape-url',
      '--url',
      input.url,
      '--page-options',
      JSON.stringify(pageOptions),
    ],
    { onLog, caller: 'designExpert' },
  );
}
