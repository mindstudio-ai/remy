import type { ToolDefinition } from '../../../api.js';
import type { ToolExecutionContext } from '../../../tools/index.js';
import {
  captureAndAnalyzeScreenshot,
  SCREENSHOT_ANALYSIS_PROMPT,
} from '../../../tools/_helpers/screenshot.js';
import { analyzeImage } from '../../common/analyzeImage.js';
import { browserAutomationTool } from '../../browserAutomation/index.js';

export const definition: ToolDefinition = {
  clearable: true,
  name: 'screenshot',
  description:
    'Capture a full-height screenshot of the current app preview. Returns a CDN URL along with visual analysis. Use to review the current state of the UI being built. Remember, the screenshot analysis is not overly precise - for example, it cannot reliably identify specific fonts by name — it can only describe what letterforms look like.',
  inputSchema: {
    type: 'object',
    properties: {
      prompt: {
        type: 'string',
        description: 'Optional specific question about the screenshot.',
      },
      path: {
        type: 'string',
        description:
          'Navigate to this path before capturing (e.g. "/settings"). If omitted, screenshots the current page.',
      },
      instructions: {
        type: 'string',
        description:
          'If the screenshot you need requires interaction first (dismissing a modal, clicking a tab, filling out a form, navigating a flow), describe the steps to get there. A browser automation agent will follow these instructions before capturing the screenshot. You will always get back a full-height screenshot of the entire page. Do not attempt to scroll or capture specific areas. Only use instructions when you need to trigger stateful changes.',
      },
    },
  },
};

export async function execute(
  input: Record<string, any>,
  onLog?: (line: string) => void,
  context?: ToolExecutionContext,
): Promise<string> {
  // Interactive screenshot — delegate to the browser automation subagent
  if (input.instructions && context) {
    try {
      const task = input.path
        ? `Navigate to "${input.path}", then: ${input.instructions}. After completing these steps, take a full-page screenshot.`
        : `${input.instructions}. After completing these steps, take a full-page screenshot.`;

      const result = await browserAutomationTool.execute({ task }, context);

      // Extract screenshot URL from the subagent's output
      const urlMatch = (result as string).match(
        /https:\/\/[^\s"')]+\.(?:png|jpg|jpeg|webp)/i,
      );
      if (!urlMatch) {
        return `Error: browser navigation completed but no screenshot URL was returned. Agent output: ${result}`;
      }

      const url = urlMatch[0];
      const analysisPrompt =
        (input.prompt as string) || SCREENSHOT_ANALYSIS_PROMPT;
      const analysis = await analyzeImage({
        prompt: analysisPrompt,
        imageUrl: url,
        onLog,
      });
      return JSON.stringify({ url, analysis });
    } catch (err: any) {
      return `Error taking interactive screenshot: ${err.message}`;
    }
  }

  // Standard screenshot — existing behavior
  try {
    return await captureAndAnalyzeScreenshot({
      prompt: input.prompt as string,
      path: input.path as string | undefined,
      onLog,
    });
  } catch (err: any) {
    return `Error taking screenshot: ${err.message}`;
  }
}
