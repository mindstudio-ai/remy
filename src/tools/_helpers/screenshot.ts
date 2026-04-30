/**
 * Shared screenshot capture + auto-analysis helper.
 *
 * Used by Remy's screenshot tool, the design expert, and browser automation.
 */

import { sidecarRequest } from './sidecar.js';
import { analyzeImage } from '../../subagents/common/analyzeImage.js';

const SCREENSHOT_ANALYSIS_PROMPT = `Describe everything visible on screen from top to bottom — every element, its position, its size relative to the viewport, its colors, its content. Be comprehensive, thorough, and spatial. After the inventory, note anything that looks visually broken (overlapping elements, clipped text, misaligned components).`;

const TEXT_WRAP_DISCLAIMER = `Note: ignore text wrapping issues. Screenshots occasionally show text wrapping onto an extra line compared to the live page — most noticeable in buttons, badges, and headings. This is a known limitation of SVG foreignObject rendering used the DOM-to-image capture library that took the screenshot. The browser's SVG renderer computes slightly wider text metrics than the HTML layout engine, so text that fits on one line in the live DOM can overflow by a fraction of a pixel in the capture - this is not a real issue.

Respond only with your analysis as Markdown and absolutely no other text. Do not use emojis - use unicode if you need symbols.`;

/**
 * Build a complete screenshot analysis prompt with optional styleMap
 * and the text-wrap disclaimer. All screenshot analysis paths should
 * use this to keep prompt construction consistent.
 */
export function buildScreenshotAnalysisPrompt(opts?: {
  prompt?: string;
  styleMap?: string;
}): string {
  let p = opts?.prompt || SCREENSHOT_ANALYSIS_PROMPT;

  if (opts?.styleMap) {
    p += `\n\nThe following styleMap describes the computed layout state at the moment of capture. Use it to verify typography, spacing, overflow, and element dimensions — it is more accurate than visual estimation from the image.\n\n<style_map>\n${opts.styleMap}\n</style_map>`;
  }

  p += `\n\n${TEXT_WRAP_DISCLAIMER}`;

  return p;
}

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
 * Run analysis on a known screenshot URL and stream cumulative
 * `{ url, analysis }` JSON snapshots through `onLog` so the frontend can
 * show the image immediately and update the analysis pane as it arrives.
 *
 * The frontend treats each `tool_input_delta` `result` as a complete
 * snapshot (replaces, doesn't append), so every emit must include the
 * full state so far — `analysis: null` initially, then the accumulated
 * text as it streams.
 */
export async function streamScreenshotAnalysis(opts: {
  url: string;
  prompt?: string;
  styleMap?: string;
  onLog?: (line: string) => void;
}): Promise<string> {
  const { url, prompt, styleMap, onLog } = opts;

  // Image-only snapshot before analysis starts — the frontend renders the
  // captured image right away while the analysis sub-agent is still working.
  onLog?.(JSON.stringify({ url, analysis: null }));

  const analysisPrompt = buildScreenshotAnalysisPrompt({ prompt, styleMap });

  let accumulated = '';
  const analysis = await analyzeImage({
    prompt: analysisPrompt,
    imageUrl: url,
    onLog: (chunk) => {
      accumulated += chunk;
      onLog?.(JSON.stringify({ url, analysis: accumulated }));
    },
  });

  return JSON.stringify({ url, analysis, ...(styleMap ? { styleMap } : {}) });
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
  let styleMap: string | undefined;
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
    styleMap = ssResult?.styleMap;
  }

  if (prompt === false) {
    return url;
  }

  return streamScreenshotAnalysis({
    url,
    prompt: prompt || undefined,
    styleMap,
    onLog,
  });
}
