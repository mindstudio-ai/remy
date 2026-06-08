/**
 * Capture a screenshot of the app preview and analyze it.
 */

import type { Tool } from '../index.js';
import {
  captureAndAnalyzeScreenshot,
  streamScreenshotAnalysis,
} from '../_helpers/screenshot.js';
import { acquireBrowserLock } from '../_helpers/browserLock.js';
import { runBrowserAutomation } from '../../subagents/browserAutomation/index.js';
import { resolveModel } from '../../models/surfaces.js';

export const screenshotTool: Tool = {
  clearable: true,
  definition: {
    name: 'screenshot',
    description:
      "Capture a screenshot of the app preview and get a description of what's on screen. Choose `fullPage`: `false` captures just the visible viewport (fast — for a specific section the page is scrolled to), `true` captures the entire page top-to-bottom (slower — for overall composition or content past the fold). Captures the settled page state — it cannot catch animations, transitions, or transient state. Optionally provide specific questions about what you're looking for. Use a bulleted list to ask many questions at once. To ask additional questions about a screenshot you have already captured, pass its URL as imageUrl to skip recapture. If the screenshot requires interaction first (logging in, clicking a tab, dismissing a modal, scrolling to a section), use the instructions param to describe the steps.",
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
        instructions: {
          type: 'string',
          description:
            "If the screenshot you need requires interaction first (dismissing a modal, clicking a tab, filling out a form, navigating a flow, scrolling to a section, getting through a login/auth checkpoint), describe the steps to get there. A browser automation agent will follow these instructions, then capture per your `fullPage` choice — so with `fullPage: false` you can scroll to a section and capture just that viewport. It can bypass auth and get right to where it needs to be if you tell it to authenticate as a test user and give it the path/screen to start its test at. Never describe what names or values to use when applying the instructions - the browser automation agent must use its own values for it to work properly. If a specific auth role is required to access the content, be sure to note that - it can automatically assume it for the purpose of testing. Use only when interaction is required to *reach* the state you want to capture — log in, dismiss a modal, switch a tab, follow a route, scroll to a section. If your steps are exercising the app's functionality across multiple states (running flows, asserting behavior under interaction, multi-step QA), use `runAutomatedBrowserTest` instead.",
        },
      },
      required: ['fullPage'],
    },
  },

  async execute(input, context) {
    const fullPage = input.fullPage === true;
    const shotKind = fullPage ? 'full-page' : 'viewport';
    try {
      if (input.imageUrl) {
        return await captureAndAnalyzeScreenshot({
          prompt: input.prompt as string,
          imageUrl: input.imageUrl as string,
          onLog: context?.onLog,
          model: resolveModel('imageAnalysis', context?.models, context?.model),
        });
      }

      // Interactive screenshot — delegate to browser automation
      if (input.instructions && context) {
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
          onLog: context?.onLog,
          model: resolveModel('imageAnalysis', context?.models, context?.model),
        });
      }

      // Standard screenshot — acquire browser lock and run
      const release = await acquireBrowserLock();
      try {
        return await captureAndAnalyzeScreenshot({
          prompt: input.prompt as string,
          path: input.path as string | undefined,
          fullPage,
          onLog: context?.onLog,
          model: resolveModel('imageAnalysis', context?.models, context?.model),
        });
      } finally {
        release();
      }
    } catch (err: any) {
      return `Error taking screenshot: ${err.message}`;
    }
  },
};
