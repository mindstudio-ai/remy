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
    "Capture a screenshot of the current app preview and get it back with visual analysis. Choose `fullPage`: `false` captures just the visible viewport (fast — use it to review a specific section the page is scrolled to), `true` captures the entire page top-to-bottom (slower — use it to review overall composition or a layout you can't see in one screen). Use to review the current state of the UI being built. Remember, the screenshot analysis is not overly precise - for example, it cannot reliably identify specific fonts by name — it can only describe what letterforms look like.",
  inputSchema: {
    type: 'object',
    properties: {
      fullPage: {
        type: 'boolean',
        description:
          'true = full-height capture of the entire page; false = just the visible viewport. Pick based on whether you need the whole page or a specific section.',
      },
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
          'If the screenshot you need requires interaction first (dismissing a modal, clicking a tab, filling out a form, scrolling to a specific section, getting through a login/auth checkpoint), describe the steps to get there. A browser automation agent will follow these instructions, then capture per your `fullPage` choice — so with `fullPage: false` you can scroll to a section and capture just that viewport. It can bypass auth and get right to where it needs to be if you tell it to authenticate as a test user and give it the path/screen to start at. Never describe what names or values to use when applying the instructions - the browser automation agent must use its own values for it to work properly. If a specific auth role is required to access the content, be sure to note that - it can automatically assume it for the purpose of testing.',
      },
    },
    required: ['fullPage'],
  },
};

export async function execute(
  input: Record<string, any>,
  onLog?: (line: string) => void,
  context?: ToolExecutionContext,
): Promise<string> {
  const fullPage = input.fullPage === true;
  const shotKind = fullPage ? 'full-page' : 'viewport';

  // Interactive screenshot — delegate to the browser automation subagent
  if (input.instructions && context) {
    try {
      const task = input.path
        ? `Navigate to "${input.path}", then: ${input.instructions}. After completing these steps, take a ${shotKind} screenshot.`
        : `${input.instructions}. After completing these steps, take a ${shotKind} screenshot.`;

      const result = await runBrowserAutomation(task, context, {
        capture: fullPage ? 'fullPage' : 'viewport',
      });
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
      fullPage,
      onLog,
      model: resolveModel('imageAnalysis', context?.models, context?.model),
    });
  } catch (err: any) {
    return `Error taking screenshot: ${err.message}`;
  } finally {
    release();
  }
}
