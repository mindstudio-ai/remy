/**
 * Shared vision analysis helper.
 *
 * Centralizes the model configuration and CLI command for analyze-image
 * so all call sites use the same model and can be updated in one place.
 */

import { runCli } from './runCli.js';

const VISION_MODEL = 'gemini-3-flash';

const VISION_MODEL_OVERRIDE = JSON.stringify({
  model: VISION_MODEL,
  config: { thinkingBudget: 'off' },
});

/**
 * Analyze an image URL with a vision model.
 * Returns the analysis text (markdown).
 */
export async function analyzeImage(params: {
  prompt: string;
  imageUrl: string;
  timeout?: number;
  onLog?: (line: string) => void;
}): Promise<string> {
  const { prompt, imageUrl, timeout = 200_000, onLog } = params;
  return runCli(
    `mindstudio analyze-image --prompt ${JSON.stringify(prompt)} --image-url ${JSON.stringify(imageUrl)} --vision-model-override ${JSON.stringify(VISION_MODEL_OVERRIDE)} --output-key analysis --no-meta`,
    { timeout, onLog },
  );
}
