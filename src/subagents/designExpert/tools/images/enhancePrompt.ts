/**
 * LLM-powered prompt enhancement for image generation.
 *
 * Takes a high-level creative brief from the design expert and produces
 * an optimized prompt for the image generation model, encoding model-specific
 * knowledge (no hex codes, style-first structure, composition rules, etc.).
 */

import { runCli } from '../../../common/runCli.js';
import { readAsset } from '../../../../assets.js';

const SYSTEM_PROMPT = readAsset(
  'subagents/designExpert/tools/images/enhance-image-prompt.md',
);

export interface EnhancePromptParams {
  brief: string;
  width: number;
  height: number;
  transparentBackground?: boolean;
  onLog?: (line: string) => void;
}

export async function enhanceImagePrompt(
  params: EnhancePromptParams,
): Promise<string> {
  const { brief, width, height, transparentBackground, onLog } = params;

  // Build context block so the enhancer knows the generation parameters
  const contextParts: string[] = [
    `Dimensions: ${width}x${height}${width > height ? ' (landscape)' : width < height ? ' (portrait)' : ' (square)'}`,
  ];
  if (transparentBackground) {
    contextParts.push(
      'Transparent background: yes — the background will be removed. Focus on the subject as an isolated element.',
    );
  }

  const message = `<context>\n${contextParts.join('\n')}\n</context>\n\n<brief>\n${brief}\n</brief>`;

  const enhanced = await runCli(
    `mindstudio generate-text --prompt ${JSON.stringify(SYSTEM_PROMPT)} --message ${JSON.stringify(message)} --output-key enhanced --no-meta`,
    { timeout: 60_000, onLog },
  );

  return enhanced.trim();
}
