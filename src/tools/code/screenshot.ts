/**
 * Capture a screenshot of the app preview and analyze it.
 */

import type { Tool } from '../index.js';
import { captureAndAnalyzeScreenshot } from '../_helpers/screenshot.js';

export const screenshotTool: Tool = {
  definition: {
    name: 'screenshot',
    description:
      "Capture a screenshot of the app preview and get a description of what's on screen. Optionally provide a specific question about what you're looking for.",
    inputSchema: {
      type: 'object',
      properties: {
        prompt: {
          type: 'string',
          description:
            "Optional question about the screenshot. If omitted, returns a general description of what's visible.",
        },
      },
    },
  },

  async execute(input) {
    try {
      return await captureAndAnalyzeScreenshot(input.prompt as string);
    } catch (err: any) {
      return `Error taking screenshot: ${err.message}`;
    }
  },
};
