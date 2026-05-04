/**
 * Capture a screenshot of the app preview and analyze it.
 */

import type { Tool } from '../index.js';
import {
  captureAndAnalyzeScreenshot,
  streamScreenshotAnalysis,
} from '../_helpers/screenshot.js';
import { acquireBrowserLock } from '../_helpers/browserLock.js';
import { browserAutomationTool } from '../../subagents/browserAutomation/index.js';

export const screenshotTool: Tool = {
  clearable: true,
  definition: {
    name: 'screenshot',
    description:
      "Capture a full-height screenshot of the app preview and get a description of what's on screen. Captures the settled page state — it cannot reliably catch animations, transitions, or transient state. For timing-sensitive bugs, read the source instead. Optionally provide specific questions about what you're looking for. Use a bulleted list to ask many questions at once. To ask additional questions about a screenshot you have already captured, pass its URL as imageUrl to skip recapture. If the screenshot requires interaction first (logging in, clicking a tab, dismissing a modal), use the instructions param to describe the steps.",
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
        instructions: {
          type: 'string',
          description:
            "If the screenshot you need requires interaction first (dismissing a modal, clicking a tab, filling out a form, navigating a flow, getting through a login/auth checkpoint), describe the steps to get there. A browser automation agent will follow these instructions before capturing the screenshot - it can bypass auth and get right to where it needs to be if you tell it to authenticate as a test user and give it the path/screen to start its test at. You will always get back a full-height screenshot of the entire page. Do not attempt to scroll or capture specific areas. Never describe what names or values to use when applying the instructions - the browser automation agent must use its own values for it to work properly. If a specific auth role is required to access the content, be sure to note that - it can automatically assume it for the purpose of testing. Use only when interaction is required to *reach* the state you want to capture — log in, dismiss a modal, switch a tab, follow a route. If your steps are exercising the app's functionality across multiple states (running flows, asserting behavior under interaction, multi-step QA), use `runAutomatedBrowserTest` instead.",
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

      // Interactive screenshot — delegate to browser automation
      if (input.instructions && context) {
        const task = input.path
          ? `Navigate to "${input.path}", then: ${input.instructions}. After completing these steps, take a full-page screenshot.`
          : `${input.instructions}. After completing these steps, take a full-page screenshot.`;

        const result = await browserAutomationTool.execute({ task }, context);
        const resultStr = result as string;

        let url: string | undefined;
        let styleMap: string | undefined;

        try {
          const parsed = JSON.parse(resultStr);
          url = parsed.screenshotUrl;
          styleMap = parsed.styleMap;
        } catch {
          // Not JSON — browser automation returned prose without a screenshot
        }

        if (!url) {
          return `Error: browser navigation completed but no screenshot URL was returned. Agent output: ${resultStr}`;
        }
        return await streamScreenshotAnalysis({
          url,
          prompt: input.prompt as string | undefined,
          styleMap,
          onLog: context?.onLog,
        });
      }

      // Standard screenshot — acquire browser lock and run
      const release = await acquireBrowserLock();
      try {
        return await captureAndAnalyzeScreenshot({
          prompt: input.prompt as string,
          path: input.path as string | undefined,
          onLog: context?.onLog,
        });
      } finally {
        release();
      }
    } catch (err: any) {
      return `Error taking screenshot: ${err.message}`;
    }
  },
};
