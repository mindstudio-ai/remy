/**
 * Shared screenshot capture + auto-analysis helper.
 *
 * Used by Remy's screenshot tool, the design expert, and browser automation.
 */

import { sidecarRequest } from './sidecar.js';
import { analyzeImage } from '../../subagents/common/analyzeImage.js';
import { resolveImageRef } from './uploadImage.js';
import type { ApiConfig } from '../../config.js';

// Outermost rung of the capture timeout ladder. Each layer must be strictly
// slower than the one it wraps, so the innermost layer — which knows *what* was
// slow — is always the one that reports the failure. These used to match the
// sandbox's exactly, and since the outer timer starts first it always won: the
// agent got this layer's opaque abort instead of the tunnel's explanation.
//
//   tunnel capture   20s / 90s   <   sandbox sidecar   30s / 120s   <   here
const VIEWPORT_CAPTURE_TIMEOUT_MS = 45_000;
const FULLPAGE_CAPTURE_TIMEOUT_MS = 135_000;

const SCREENSHOT_ANALYSIS_PROMPT = `Describe everything visible on screen from top to bottom — every element, its position, its size relative to the viewport, its colors, its content. Be comprehensive, thorough, and spatial. After the inventory, note anything that looks visually broken (overlapping elements, clipped text, misaligned components).`;

const ANALYSIS_RESPONSE_FORMAT = `Respond only with your analysis as Markdown and absolutely no other text. Do not use emojis - use unicode if you need symbols.`;

/**
 * Build a complete screenshot analysis prompt with optional styleMap
 * and the response-format instruction. All screenshot analysis paths should
 * use this to keep prompt construction consistent.
 */
export function buildScreenshotAnalysisPrompt(opts?: {
  prompt?: string;
  /** Specific questions to answer in addition to the base prompt's inventory.
   * Lets one analysis serve two readers — the sub-agent that needs the full
   * inventory and a caller with targeted questions. */
  additionalQuestions?: string;
  styleMap?: string;
}): string {
  let p = opts?.prompt || SCREENSHOT_ANALYSIS_PROMPT;

  if (opts?.additionalQuestions) {
    p += `\n\nAfter the analysis above, also answer the following specific questions about the screenshot:\n\n${opts.additionalQuestions}`;
  }

  if (opts?.styleMap) {
    p += `\n\nThe following styleMap describes the computed layout state at the moment of capture. Use it to verify typography, spacing, overflow, and element dimensions — it is more accurate than visual estimation from the image.\n\n<style_map>\n${opts.styleMap}\n</style_map>`;
  }

  p += `\n\n${ANALYSIS_RESPONSE_FORMAT}`;

  return p;
}

export interface RenderHtmlResult {
  /** Hosted URL of the captured PNG. Dev-session scratch storage — callers
   * that need the image to outlive the session must re-host it. */
  url: string;
  /** Output dimensions in pixels (css × scale). */
  width: number;
  height: number;
}

/**
 * Render an agent-authored HTML document in the sandbox browser and capture
 * it as a PNG. Renders in a fresh tab — never touches the app preview page.
 * Used for deterministic brand graphics where the design agent composes
 * HTML/CSS and needs real pixels back, and for reviewing a document it wrote
 * to disk.
 */
export async function renderHtmlViaSidecar(opts: {
  html: string;
  width: number;
  height: number;
  /** Fit the capture to the document's own height, for a document that
   * declares no height — `height` becomes the starting viewport rather than
   * the canvas, and the result comes back at whatever was used. A tunnel too
   * old to know the flag ignores it and captures at `height`, so callers get a
   * clipped or padded review, never an error. */
  autoHeight?: boolean;
  /** True-alpha PNG — only meaningful when the document leaves its own
   * background transparent. */
  transparent?: boolean;
  /** Device scale factor (output pixels = css × scale). Clamped to 1–3
   * tunnel-side. */
  scale?: number;
}): Promise<RenderHtmlResult> {
  const result = await sidecarRequest(
    '/render-html',
    {
      html: opts.html,
      width: opts.width,
      height: opts.height,
      ...(opts.autoHeight ? { autoHeight: true } : {}),
      ...(opts.transparent ? { transparent: true } : {}),
      ...(opts.scale != null ? { scale: opts.scale } : {}),
    },
    { timeout: VIEWPORT_CAPTURE_TIMEOUT_MS },
  );
  const url = result?.url;
  if (!url) {
    throw new Error(
      `No URL in sidecar render response. The browser may not be ready yet. Response: ${JSON.stringify(result)}`,
    );
  }
  return { url, width: result.width, height: result.height };
}

export interface ScreenshotOptions {
  /** Analysis prompt. Pass `false` to skip analysis and return just the URL. */
  prompt?: string | false;
  /** Existing image to analyze instead of capturing a new screenshot — a URL
   * from an earlier capture, or a path on disk. */
  image?: string;
  /** Navigate to this path before capturing (e.g. "/settings"). */
  path?: string;
  /** Capture the full page height (default) vs. just the visible viewport.
   * Viewport captures skip the pre-roll scroll, so they're faster and far less
   * failure-prone for long pages. */
  fullPage?: boolean;
  /** Exact-size capture: clip to these viewport dimensions. Both must be set
   * together; providing them forces a viewport capture (overrides `fullPage`). */
  width?: number;
  height?: number;
  /** Output format. Defaults to 'jpeg' (existing behavior). Use 'png' for crisp
   * flat graphics, where JPEG artifacts show on sharp type. */
  format?: 'png' | 'jpeg';
  /** Called for each log line emitted during CLI execution. */
  onLog?: (line: string) => void;
  /** Authoritative model ID for the vision analysis. Caller resolves
   * via `resolveModel('imageAnalysis', ...)` before invoking. Required
   * when analysis runs; ignored when `prompt === false`. */
  model?: string;
  /** Needed to host `image` when it's a local file. */
  apiConfig?: ApiConfig;
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
  /** A URL, or a path on disk (hosted before the first snapshot is emitted —
   * the frontend renders this value as an image src). */
  image: string;
  prompt?: string;
  styleMap?: string;
  onLog?: (line: string) => void;
  model: string;
  apiConfig?: ApiConfig;
}): Promise<string> {
  const { image, prompt, styleMap, onLog, model, apiConfig } = opts;

  // Resolve before the first emit rather than leaving it to analyzeImage: the
  // snapshot below is what the frontend renders, so it needs a real URL.
  const url = await resolveImageRef(image, apiConfig);

  // Image-only snapshot before analysis starts — the frontend renders the
  // captured image right away while the analysis sub-agent is still working.
  onLog?.(JSON.stringify({ url, analysis: null }));

  const analysisPrompt = buildScreenshotAnalysisPrompt({ prompt, styleMap });

  let accumulated = '';
  const { analysis } = await analyzeImage({
    prompt: analysisPrompt,
    image: url,
    model,
    onLog: (chunk) => {
      accumulated += chunk;
      onLog?.(JSON.stringify({ url, analysis: accumulated }));
    },
  });

  return JSON.stringify({ url, analysis, ...(styleMap ? { styleMap } : {}) });
}

/**
 * Capture a screenshot via sidecar and optionally analyze it.
 * If `image` is provided, skip capture and analyze that image directly.
 */
export async function captureAndAnalyzeScreenshot(
  promptOrOptions?: string | false | ScreenshotOptions,
): Promise<string> {
  let prompt: string | false | undefined;
  let existingImage: string | undefined;
  let onLog: ((line: string) => void) | undefined;
  let model: string | undefined;
  let apiConfig: ApiConfig | undefined;

  let path: string | undefined;
  let fullPage = true;
  let width: number | undefined;
  let height: number | undefined;
  let format: 'png' | 'jpeg' | undefined;

  if (typeof promptOrOptions === 'object' && promptOrOptions !== null) {
    prompt = promptOrOptions.prompt;
    existingImage = promptOrOptions.image;
    path = promptOrOptions.path;
    if (promptOrOptions.fullPage !== undefined) {
      fullPage = promptOrOptions.fullPage;
    }
    width = promptOrOptions.width;
    height = promptOrOptions.height;
    format = promptOrOptions.format;
    onLog = promptOrOptions.onLog;
    model = promptOrOptions.model;
    apiConfig = promptOrOptions.apiConfig;
  } else {
    prompt = promptOrOptions;
  }

  // An exact width/height request is always a viewport clip, never a full-page
  // capture — force the viewport endpoint so the size is honored.
  if (width != null && height != null) {
    fullPage = false;
  }

  let url: string;
  let styleMap: string | undefined;
  if (existingImage) {
    url = existingImage;
  } else {
    const ssResult = await sidecarRequest(
      fullPage ? '/screenshot-full-page' : '/screenshot-viewport',
      {
        ...(path ? { path } : {}),
        ...(width != null ? { width } : {}),
        ...(height != null ? { height } : {}),
        ...(format ? { format } : {}),
      },
      {
        timeout: fullPage
          ? FULLPAGE_CAPTURE_TIMEOUT_MS
          : VIEWPORT_CAPTURE_TIMEOUT_MS,
      },
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
    // Callers want a URL, not the path they may have handed in.
    return resolveImageRef(url, apiConfig);
  }

  if (!model) {
    throw new Error(
      'captureAndAnalyzeScreenshot: `model` is required when analysis is enabled',
    );
  }
  return streamScreenshotAnalysis({
    image: url,
    apiConfig,
    prompt: prompt || undefined,
    styleMap,
    onLog,
    model,
  });
}
