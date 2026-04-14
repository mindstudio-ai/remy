/**
 * Capture a screenshot of the app preview and analyze it.
 */

import type { Tool } from '../index.js';
import {
  captureAndAnalyzeScreenshot,
  buildScreenshotAnalysisPrompt,
} from '../_helpers/screenshot.js';
import {
  acquireBrowserLock,
  checkBrowserConnected,
} from '../_helpers/browserLock.js';
import { analyzeImage } from '../../subagents/common/analyzeImage.js';
import { browserAutomationTool } from '../../subagents/browserAutomation/index.js';

export const screenshotTool: Tool = {
  clearable: true,
  definition: {
    name: 'screenshot',
    description:
      "Capture a full-height screenshot of the app preview and get a description of what's on screen. Provides static image analysis only, will not capture animations or video. Optionally provide specific questions about what you're looking for. Use a bulleted list to ask many questions at once. To ask additional questions about a screenshot you have already captured, pass its URL as imageUrl to skip recapture. If the screenshot requires interaction first (logging in, clicking a tab, dismissing a modal), use the instructions param to describe the steps.",
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
            'If the screenshot you need requires interaction first (dismissing a modal, clicking a tab, filling out a form, navigating a flow, getting through a login/auth checkpoint), describe the steps to get there. A browser automation agent will follow these instructions before capturing the screenshot - it can bypass auth and get right to where it needs to be if you tell it to authenticate as a test user and give it the path/screen to start its test at. You will always get back a full-height screenshot of the entire page. Do not attempt to scroll or capture specific areas. Only use instructions when you need to trigger stateful changes. Never describe what names or values to use when applying the isntructions - the browser automation agent must use its own values for it to work properly. If a specific auth role is required to access the content, be sure to note that - it can automatically assume it for the purpose of testing.',
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
        const analysisPrompt = buildScreenshotAnalysisPrompt({
          prompt: input.prompt as string | undefined,
          styleMap,
        });
        const analysis = await analyzeImage({
          prompt: analysisPrompt,
          imageUrl: url,
          onLog: context?.onLog,
        });
        return JSON.stringify({
          url,
          analysis,
          ...(styleMap ? { styleMap } : {}),
        });
      }

      // Standard screenshot — acquire browser lock and check status
      const release = await acquireBrowserLock();
      try {
        const browserStatus = await checkBrowserConnected();
        if (!browserStatus.connected) {
          return `Error: ${browserStatus.error}`;
        }
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
