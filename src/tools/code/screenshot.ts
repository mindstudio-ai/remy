/**
 * Capture a screenshot of the app preview.
 *
 * External tool. The sandbox captures the screenshot, uploads to CDN,
 * and returns the URL.
 */

import type { Tool } from '../index.js';

export const screenshotTool: Tool = {
  definition: {
    name: 'screenshot',
    description:
      'Capture a screenshot of the app preview. Returns a CDN URL with dimensions. Useful for visually checking the current state after UI changes or when debugging layout issues.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },

  async execute() {
    return 'ok';
  },
};
