/**
 * Fetch the content of a URL.
 *
 * Shells out to `mindstudio scrape-url` which handles rendering,
 * extraction, and optional screenshotting.
 */

import { exec } from 'node:child_process';
import type { Tool } from '../index.js';

export const fetchUrlTool: Tool = {
  definition: {
    name: 'scapeWebUrl',
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

  async execute(input) {
    const url = input.url as string;
    const screenshot = input.screenshot as boolean | undefined;

    const pageOptions: Record<string, any> = { onlyMainContent: true };
    if (screenshot) {
      pageOptions.screenshot = true;
    }

    const cmd = `mindstudio scrape-url --url ${JSON.stringify(url)} --page-options ${JSON.stringify(JSON.stringify(pageOptions))} --no-meta`;

    return new Promise<string>((resolve) => {
      exec(
        cmd,
        { timeout: 60_000, maxBuffer: 1024 * 1024 },
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
