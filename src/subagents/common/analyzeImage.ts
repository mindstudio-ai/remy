/**
 * Shared vision analysis helper.
 *
 * The caller resolves the model via `resolveModel('imageAnalysis', ...)`
 * before invoking — Remy is authoritative for defaults via the model
 * surfaces registry, so this helper just trusts whatever it's given.
 */

import { runMindstudioCli } from './runMindstudioCli.js';

/**
 * Analyze an image URL with a vision model.
 * Returns the analysis text (markdown).
 */
export async function analyzeImage(params: {
  prompt: string;
  imageUrl: string;
  /** Authoritative model ID. Resolve via `resolveModel('imageAnalysis', ...)`
   * before calling. */
  model: string;
  timeout?: number;
  onLog?: (line: string) => void;
}): Promise<string> {
  const { prompt, imageUrl, model, timeout = 200_000, onLog } = params;
  return runMindstudioCli(
    [
      'analyze-image',
      '--prompt',
      prompt,
      '--image-url',
      imageUrl,
      '--vision-model-override',
      JSON.stringify({ model }),
    ],
    { outputKey: 'analysis', timeout, onLog },
  );
}
