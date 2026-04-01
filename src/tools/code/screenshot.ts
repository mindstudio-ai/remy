/**
 * Capture a screenshot of the app preview and analyze it.
 */

import type { Tool } from '../index.js';
import { captureAndAnalyzeScreenshot } from '../_helpers/screenshot.js';

export const screenshotTool: Tool = {
  clearable: true,
  definition: {
    name: 'screenshot',
    description:
      "Capture a full-height screenshot of the app preview and get a description of what's on screen. Provides static image analysis only, will not capture animations or video. Optionally provide specific questions about what you're looking for. Use a bulleted list to ask many questions at once. To ask additional questions about a screenshot you have already captured, pass its URL as imageUrl to skip recapture.",
    inputSchema: {
      type: 'object',
      properties: {
        prompt: {
          type: 'string',
          description:
            "Optional question about the screenshot. If omitted, returns a general description of what's visible.",
        },
        imageUrl: {
          type: 'string',
          description:
            'URL of an existing screenshot to analyze instead of capturing a new one. Use this for additional questions about a previous screenshot.',
        },
        path: {
          type: 'string',
          description:
            'Navigate to this path before capturing (e.g. "/settings", "/dashboard"). If omitted, screenshots the current page.',
        },
      },
    },
  },

  async execute(input, context) {
    try {
      if (input.imageUrl) {
        return await captureAndAnalyzeScreenshot({
          prompt: input.prompt as string,
          imageUrl: input.imageUrl as string,
          onLog: context?.onLog,
        });
      }
      return await captureAndAnalyzeScreenshot({
        prompt: input.prompt as string,
        path: input.path as string | undefined,
        onLog: context?.onLog,
      });
    } catch (err: any) {
      return `Error taking screenshot: ${err.message}`;
    }
  },
};
