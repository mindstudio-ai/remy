import type { ToolDefinition } from '../../../api.js';
import { captureAndAnalyzeScreenshot } from '../../../tools/_helpers/screenshot.js';

export const definition: ToolDefinition = {
  name: 'screenshot',
  description:
    "Capture a screenshot of the current app preview. Returns a CDN URL along with visual analysis. Use to review the current state of the UI being built. By default captures the user's viewport. Set fullPage to capture the entire scrollable page. Remember, the screenshot analysis is not overly precise - for example, it cannot reliably identify specific fonts by name — it can only describe what letterforms look like.",
  inputSchema: {
    type: 'object',
    properties: {
      prompt: {
        type: 'string',
        description: 'Optional specific question about the screenshot.',
      },
      fullPage: {
        type: 'boolean',
        description:
          'Capture the full scrollable page instead of just the viewport. Use when you need to see below-the-fold content.',
      },
    },
  },
};

export async function execute(input: Record<string, any>): Promise<string> {
  try {
    return await captureAndAnalyzeScreenshot({
      prompt: input.prompt as string,
      fullPage: input.fullPage as boolean,
    });
  } catch (err: any) {
    return `Error taking screenshot: ${err.message}`;
  }
}
