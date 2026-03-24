/**
 * Shared screenshot capture + auto-analysis helper.
 *
 * Used by Remy's screenshot tool, the design expert, and browser automation.
 */

import { sidecarRequest } from './sidecar.js';
import { runCli } from '../../subagents/common/runCli.js';
import { log } from '../../logger.js';

export const SCREENSHOT_ANALYSIS_PROMPT =
  'Describe everything visible on screen from top to bottom — every element, its position, its size relative to the viewport, its colors, its content. Be thorough and spatial. After the inventory, note anything that looks visually broken (overlapping elements, clipped text, misaligned components).';

export interface ScreenshotOptions {
  /** Analysis prompt. Pass `false` to skip analysis and return just the URL. */
  prompt?: string | false;
  /** Capture only the visible viewport instead of the full scrollable page. */
  viewportOnly?: boolean;
}

/**
 * Capture a screenshot via sidecar and optionally analyze it.
 */
export async function captureAndAnalyzeScreenshot(
  promptOrOptions?: string | false | ScreenshotOptions,
): Promise<string> {
  let prompt: string | false | undefined;
  let viewportOnly = false;

  if (typeof promptOrOptions === 'object' && promptOrOptions !== null) {
    prompt = promptOrOptions.prompt;
    viewportOnly = promptOrOptions.viewportOnly ?? false;
  } else {
    prompt = promptOrOptions;
  }

  const ssResult = await sidecarRequest(
    '/screenshot',
    { fullPage: !viewportOnly },
    { timeout: 120000 },
  );
  log.debug('Screenshot response', { ssResult });
  const url = ssResult?.url || ssResult?.screenshotUrl;
  if (!url) {
    throw new Error(
      `No URL in sidecar response. The browser may not be ready yet. Response: ${JSON.stringify(ssResult)}`,
    );
  }

  if (prompt === false) {
    return url;
  }

  const analysisPrompt = prompt || SCREENSHOT_ANALYSIS_PROMPT;
  const analysis = await runCli(
    `mindstudio analyze-image --prompt ${JSON.stringify(analysisPrompt)} --image-url ${JSON.stringify(url)} --output-key analysis --no-meta`,
  );
  return JSON.stringify({ url, analysis });
}
