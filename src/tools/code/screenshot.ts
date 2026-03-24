/**
 * Capture a screenshot of the app preview and analyze it.
 */

import type { Tool } from '../index.js';
import { captureAndAnalyzeScreenshot } from '../_helpers/screenshot.js';

export const screenshotTool: Tool = {
  definition: {
    name: 'screenshot',
    description:
      "Capture a screenshot of the app preview and get a description of what's on screen. Optionally provide a specific question about what you're looking for. By default captures the viewport (what the user sees). Set fullPage to capture the entire scrollable page.",
    inputSchema: {
      type: 'object',
      properties: {
        prompt: {
          type: 'string',
          description:
            "Optional question about the screenshot. If omitted, returns a general description of what's visible.",
        },
        fullPage: {
          type: 'boolean',
          description:
            'Capture the full scrollable page instead of just the viewport. Use when you need to see below-the-fold content.',
        },
      },
    },
  },

  async execute(input) {
    try {
      return await captureAndAnalyzeScreenshot({
        prompt: input.prompt as string,
        fullPage: input.fullPage as boolean,
      });
    } catch (err: any) {
      return `Error taking screenshot: ${err.message}`;
    }
  },
};
