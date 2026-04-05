/**
 * Shared screenshot capture + auto-analysis helper.
 *
 * Used by Remy's screenshot tool, the design expert, and browser automation.
 */

import { sidecarRequest } from './sidecar.js';
import { analyzeImage } from '../../subagents/common/analyzeImage.js';

export const SCREENSHOT_ANALYSIS_PROMPT = `Describe everything visible on screen from top to bottom — every element, its position, its size relative to the viewport, its colors, its content. Be comprehensive, thorough, and spatial. After the inventory, note anything that looks visually broken (overlapping elements, clipped text, misaligned components).

Note: ignore text wrapping issues. Screenshots occasionally show text wrapping onto an extra line compared to the live page — most noticeable in buttons, badges, and headings. This is a known limitation of SVG foreignObject rendering used the DOM-to-image capture library that took the screenshot. The browser's SVG renderer computes slightly wider text metrics than the HTML layout engine, so text that fits on one line in the live DOM can overflow by a fraction of a pixel in the capture - this is not a real issue.

Respond only with your analysis as Markdown and absolutely no other text. Do not use emojis - use unicode if you need symbols.`;

export interface ScreenshotOptions {
  /** Analysis prompt. Pass `false` to skip analysis and return just the URL. */
  prompt?: string | false;
  /** Existing image URL to analyze instead of capturing a new screenshot. */
  imageUrl?: string;
  /** Navigate to this path before capturing (e.g. "/settings"). */
  path?: string;
  /** Called for each log line emitted during CLI execution. */
  onLog?: (line: string) => void;
}

/**
 * Capture a screenshot via sidecar and optionally analyze it.
 * If imageUrl is provided, skip capture and analyze that image directly.
 */
export async function captureAndAnalyzeScreenshot(
  promptOrOptions?: string | false | ScreenshotOptions,
): Promise<string> {
  let prompt: string | false | undefined;
  let existingUrl: string | undefined;
  let onLog: ((line: string) => void) | undefined;

  let path: string | undefined;

  if (typeof promptOrOptions === 'object' && promptOrOptions !== null) {
    prompt = promptOrOptions.prompt;
    existingUrl = promptOrOptions.imageUrl;
    path = promptOrOptions.path;
    onLog = promptOrOptions.onLog;
  } else {
    prompt = promptOrOptions;
  }

  let url: string;
  if (existingUrl) {
    url = existingUrl;
  } else {
    const ssResult = await sidecarRequest(
      '/screenshot-full-page',
      path ? { path } : undefined,
      { timeout: 120000 },
    );
    url = ssResult?.url || ssResult?.screenshotUrl;
    if (!url) {
      throw new Error(
        `No URL in sidecar response. The browser may not be ready yet. Response: ${JSON.stringify(ssResult)}`,
      );
    }
  }

  if (prompt === false) {
    return url;
  }

  const analysisPrompt = prompt || SCREENSHOT_ANALYSIS_PROMPT;
  const analysis = await analyzeImage({
    prompt: analysisPrompt,
    imageUrl: url,
    onLog,
  });
  return JSON.stringify({ url, analysis });
}
