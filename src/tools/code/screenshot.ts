/**
 * Capture a screenshot of the app preview and analyze it.
 *
 * Calls the sidecar to take the screenshot, then runs analyze-image
 * to describe what's on screen.
 */

import type { Tool } from '../index.js';
import { sidecarRequest } from '../_helpers/sidecar.js';
import { runCli } from '../../subagents/common/runCli.js';
import { log } from '../../logger.js';

export const SCREENSHOT_ANALYSIS_PROMPT =
  'Describe everything visible on screen from top to bottom — every element, its position, its size relative to the viewport, its colors, its content. Be thorough and spatial. After the inventory, note anything that looks visually broken (overlapping elements, clipped text, misaligned components).';

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
      const ssResult = await sidecarRequest(
        '/screenshot',
        {},
        { timeout: 120000 },
      );
      log.debug('Screenshot response', { ssResult });
      const url = ssResult?.url || ssResult?.screenshotUrl;
      if (!url) {
        return `Error taking screenshot: no URL in sidecar response. The browser may not be ready yet. Response: ${JSON.stringify(ssResult)}`;
      }

      const analysisPrompt =
        (input.prompt as string) || SCREENSHOT_ANALYSIS_PROMPT;
      const analysis = await runCli(
        `mindstudio analyze-image --prompt ${JSON.stringify(analysisPrompt)} --image-url ${JSON.stringify(url)} --output-key analysis --no-meta`,
      );

      return `Screenshot: ${url}\n\n${analysis}`;
    } catch (err: any) {
      return `Error taking screenshot: ${err.message}`;
    }
  },
};
