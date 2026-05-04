/**
 * Fetch the content of a URL.
 *
 * Shells out to `mindstudio scrape-url` which handles rendering,
 * extraction, and optional screenshotting.
 */

import type { Tool } from '../index.js';
import { runCli } from '../../subagents/common/runCli.js';

export const scrapeWebUrlTool: Tool = {
  clearable: false,
  definition: {
    name: 'scrapeWebUrl',
    description:
      'Scrape the content of a web page. Returns the HTML of the page as markdown text. Optionally capture a screenshot if you need see the visual design. Use this when you need to fetch or analyze content from a website',
    inputSchema: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: 'The URL to fetch.',
        },
        screenshot: {
          type: 'boolean',
          description:
            'Capture a screenshot of the page in addition to the text content. Adds latency; only use when you need to see the visual design.',
        },
      },
      required: ['url'],
    },
  },

  async execute(input, context) {
    const url = input.url as string;
    const screenshot = input.screenshot as boolean | undefined;

    const pageOptions: Record<string, any> = { onlyMainContent: true };
    if (screenshot) {
      pageOptions.screenshot = true;
    }

    return runCli(
      'mindstudio',
      [
        'scrape-url',
        '--url',
        url,
        '--page-options',
        JSON.stringify(pageOptions),
        '--no-meta',
      ],
      { onLog: context?.onLog },
    );
  },
};
