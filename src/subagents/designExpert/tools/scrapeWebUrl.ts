import type { ToolDefinition } from '../../../api.js';
import { fetchWebPage } from '../../../tools/common/scrapeWebUrl.js';

export const definition: ToolDefinition = {
  name: 'scrapeWebUrl',
  description:
    'Fetch a web page as markdown, plus `screenshot`, a full-page capture you can analyze. Use for reading a specific URL — a site the user referenced, a brand to match, a page the researcher cited that you want in full.',
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
  return fetchWebPage(String(input.url), {
    screenshot: true,
    caller: 'designExpert',
    onLog,
  });
}
