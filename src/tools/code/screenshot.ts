/**
 * Capture a screenshot of the app preview and analyze it.
 *
 * Shared with the design expert, which offers the same tool — it imports
 * `screenshotDefinition` and `executeScreenshot` and registers them under its own
 * convention (see subagents/designExpert/tools/index.ts). The two used to own
 * near-identical copies, which had already drifted: only one documented
 * `imageUrl` / `width` / `height` / `format`, only the other carried the caveat
 * about font identification (true of both). Anything fixed in one silently missed
 * the other.
 *
 * `executeScreenshot` takes `onLog` as an argument rather than reading it off the
 * context, because the two registries carry it differently.
 */

import type { ToolDefinition } from '../../api.js';
import type { Tool, ToolExecutionContext } from '../index.js';
import {
  captureAndAnalyzeScreenshot,
  streamScreenshotAnalysis,
} from '../_helpers/screenshot.js';
import { acquireBrowserLock } from '../_helpers/browserLock.js';
import { runBrowserAutomation } from '../../subagents/browserAutomation/index.js';
import { resolveModel } from '../../models/surfaces.js';

export const screenshotDefinition: ToolDefinition = {
  clearable: true,
  name: 'screenshot',
  description:
    "Capture a screenshot of the app preview and get a description of what's on screen. Choose `fullPage`: `false` captures just the visible viewport (fast — for a specific section the page is scrolled to), `true` captures the entire page top-to-bottom (slower — for overall composition or content past the fold). Captures the settled page state — it cannot catch animations, transitions, or transient state. The analysis is not precise about every detail — for example it cannot reliably identify specific fonts by name, only describe what the letterforms look like. Optionally provide specific questions about what you're looking for. Use a bulleted list to ask many questions at once. To ask additional questions about a screenshot you have already captured, pass its URL as imageUrl to skip recapture. If the screenshot requires interaction first (logging in, clicking a tab, dismissing a modal, scrolling to a section), use the instructions param to describe the steps. To render a fixed-size image such as an Open Graph share card, set `width` and `height` (e.g. 1200 × 630) and `format: 'png'`: the tool navigates to `path`, clips to exactly those pixel dimensions, and returns the image URL.",
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
      width: {
        type: 'number',
        description:
          'Exact capture width in pixels. Set together with `height` to render a fixed-size image; clips to exactly this viewport instead of the default preview size.',
      },
      height: {
        type: 'number',
        description:
          'Exact capture height in pixels. Set together with `width`.',
      },
      format: {
        type: 'string',
        enum: ['png', 'jpeg'],
        description:
          "Output image format. Defaults to 'jpeg'. Use 'png' for crisp flat graphics like share cards, where JPEG artifacts show on sharp type and edges.",
      },
      instructions: {
        type: 'string',
        description:
          "If the screenshot you need requires interaction first (dismissing a modal, clicking a tab, filling out a form, navigating a flow, scrolling to a section, getting through a login/auth checkpoint), describe the steps to get there. A browser automation agent will follow these instructions, then capture per your `fullPage` choice — so with `fullPage: false` you can scroll to a section and capture just that viewport. It can bypass auth and get right to where it needs to be if you tell it to authenticate as a test user and give it the path/screen to start its test at. Never describe what names or values to use when applying the instructions - the browser automation agent must use its own values for it to work properly. If a specific auth role is required to access the content, be sure to note that - it can automatically assume it for the purpose of testing. Use only when interaction is required to *reach* the state you want to capture — log in, dismiss a modal, switch a tab, follow a route, scroll to a section. If your steps are exercising the app's functionality across multiple states (running flows, asserting behavior under interaction, multi-step QA), use `runAutomatedBrowserTest` instead.",
      },
    },
    required: ['fullPage'],
  },
};

/**
 * Capture and analyze, routing through browser automation when the requested
 * state needs interaction to reach.
 */
export async function executeScreenshot(
  input: Record<string, any>,
  onLog?: (line: string) => void,
  context?: ToolExecutionContext,
): Promise<string> {
  const fullPage = input.fullPage === true;
  const model = resolveModel('imageAnalysis', context?.models, context?.model);

  try {
    if (input.imageUrl) {
      return await captureAndAnalyzeScreenshot({
        prompt: input.prompt as string,
        imageUrl: input.imageUrl as string,
        onLog,
        model,
      });
    }

    // Interactive screenshot — delegate to browser automation, which takes the
    // browser lock itself for the whole run.
    if (input.instructions && context) {
      const shotKind = fullPage ? 'full-page' : 'viewport';
      const task = input.path
        ? `Navigate to "${input.path}", then: ${input.instructions}. After completing these steps, take a ${shotKind} screenshot.`
        : `${input.instructions}. After completing these steps, take a ${shotKind} screenshot.`;

      const result = await runBrowserAutomation(task, context, {
        capture: fullPage ? 'fullPage' : 'viewport',
      });
      // No screenshot came back — return the sub-agent's prose so the model
      // still sees its report.
      if (!result.screenshot) {
        return result.text;
      }
      return await streamScreenshotAnalysis({
        url: result.screenshot.url,
        prompt: input.prompt as string | undefined,
        styleMap: result.screenshot.styleMap,
        onLog,
        model,
      });
    }

    const release = await acquireBrowserLock();
    try {
      return await captureAndAnalyzeScreenshot({
        prompt: input.prompt as string,
        path: input.path as string | undefined,
        fullPage,
        width: input.width as number | undefined,
        height: input.height as number | undefined,
        format: input.format as 'png' | 'jpeg' | undefined,
        onLog,
        model,
      });
    } finally {
      release();
    }
  } catch (err: any) {
    return `Error taking screenshot: ${err.message}`;
  }
}

export const screenshotTool: Tool = {
  clearable: true,
  definition: screenshotDefinition,
  execute: (input, context) =>
    executeScreenshot(input, context?.onLog, context),
};
