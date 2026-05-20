import type { ToolDefinition } from '../../../api.js';
import type { ToolExecutionContext } from '../../../tools/index.js';
import {
  captureAndAnalyzeScreenshot,
  streamScreenshotAnalysis,
} from '../../../tools/_helpers/screenshot.js';
import { acquireBrowserLock } from '../../../tools/_helpers/browserLock.js';
import { runBrowserAutomation } from '../../browserAutomation/index.js';
import { resolveModel } from '../../../models/surfaces.js';

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
        description:
          'Optional specific question about the screenshot. Use a bulleted list to ask many questions at once.',
      },
      path: {
        type: 'string',
        description:
          'Navigate to this path before capturing (e.g. "/settings"). If omitted, screenshots the current page.',
      },
      instructions: {
        type: 'string',
        description:
          'If the screenshot you need requires interaction first (dismissing a modal, clicking a tab, filling out a form, navigating a flow, getting through a login/auth checkpoint), describe the steps to get there. A browser automation agent will follow these instructions before capturing the screenshot - it can bypass auth and get right to where it needs to be if you tell it to authenticate as a test user and give it the path/screen to start its test at. You will always get back a full-height screenshot of the entire page. Do not attempt to scroll or capture specific areas. Only use instructions when you need to trigger stateful changes. Never describe what names or values to use when applying the isntructions - the browser automation agent must use its own values for it to work properly. If a specific auth role is required to access the content, be sure to note that - it can automatically assume it for the purpose of testing.',
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

      const result = await runBrowserAutomation(task, context);
      // No final screenshot — return the sub-agent's prose so the model
      // still sees its report.
      if (!result.screenshot) {
        return result.text;
      }
      return await streamScreenshotAnalysis({
        url: result.screenshot.url,
        prompt: input.prompt as string | undefined,
        styleMap: result.screenshot.styleMap,
        onLog,
        model: resolveModel('imageAnalysis', context?.models, context?.model),
      });
    } catch (err: any) {
      return `Error taking interactive screenshot: ${err.message}`;
    }
  }

  // Standard screenshot — acquire browser lock and run
  const release = await acquireBrowserLock();
  try {
    return await captureAndAnalyzeScreenshot({
      prompt: input.prompt as string,
      path: input.path as string | undefined,
      onLog,
      model: resolveModel('imageAnalysis', context?.models, context?.model),
    });
  } catch (err: any) {
    return `Error taking screenshot: ${err.message}`;
  } finally {
    release();
  }
}
