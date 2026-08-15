/**
 * Shared vision analysis helper.
 *
 * The caller resolves the model via `resolveModel('imageAnalysis', ...)`
 * before invoking — Remy is authoritative for defaults via the model
 * surfaces registry, so this helper just trusts whatever it's given.
 */

import { runMindstudioCliResult } from './runMindstudioCli.js';
import { resolveImageRef } from '../../tools/_helpers/uploadImage.js';
import type { ApiConfig } from '../../config.js';

export interface ImageAnalysis {
  /** The URL the analysis actually ran against — a local `image` after upload.
   * Report this one back, not the caller's input: it's what the frontend can
   * render and what the model can reuse for follow-up questions. */
  url: string;
  /** The analysis text (markdown). */
  analysis: string;
}

/**
 * Analyze an image with a vision model.
 *
 * `image` is a URL or a path on disk; a local file is uploaded first, since
 * the analysis runs on the platform and can't see the sandbox filesystem.
 * Throws when the image can't be resolved or the analysis fails — callers
 * forward the text verbatim, and a failure that reads like an analysis is
 * worse than no analysis.
 */
export async function analyzeImage(params: {
  prompt: string;
  image: string;
  /** Needed to host a local file. Absent only where no context exists. */
  apiConfig?: ApiConfig;
  /** Authoritative model ID. Resolve via `resolveModel('imageAnalysis', ...)`
   * before calling. */
  model: string;
  timeout?: number;
  onLog?: (line: string) => void;
}): Promise<ImageAnalysis> {
  const { prompt, image, apiConfig, model, timeout = 200_000, onLog } = params;

  const url = await resolveImageRef(image, apiConfig);

  const result = await runMindstudioCliResult(
    [
      'analyze-image',
      '--prompt',
      prompt,
      '--image-url',
      url,
      '--vision-model-override',
      JSON.stringify({ model }),
    ],
    { outputKey: 'analysis', timeout, onLog },
  );
  if (!result.ok) {
    throw new Error(`Could not analyze ${url}: ${result.value}`);
  }

  return { url, analysis: result.value };
}
