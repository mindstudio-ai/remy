/**
 * LLM-powered prompt enhancement for image generation.
 *
 * Takes a high-level creative brief from the design expert and produces
 * an optimized prompt for the image generation model, encoding model-specific
 * knowledge (no hex codes, style-first structure, composition rules, etc.).
 */

import { runMindstudioCli } from '../../../common/runMindstudioCli.js';
import { readAsset } from '../../../../assets.js';

const SYSTEM_PROMPT = readAsset(
  'subagents/designExpert/tools/images/enhance-image-prompt.md',
);

export interface EnhancePromptParams {
  brief: string;
  width: number;
  height: number;
  transparentBackground?: boolean;
  /** Whether a reference image is provided to the generation model alongside
   * the prompt. When true, the enhancer is told to complement it rather than
   * re-describe it. */
  hasReferenceImage?: boolean;
  onLog?: (line: string) => void;
  /** Authoritative model ID for the text LLM that rewrites the brief.
   * Resolved via `resolveModel('imagePromptEnhancer', ...)` by the caller. */
  model: string;
}

export async function enhanceImagePrompt(
  params: EnhancePromptParams,
): Promise<string> {
  const {
    brief,
    width,
    height,
    transparentBackground,
    hasReferenceImage,
    onLog,
    model,
  } = params;

  // Build context block so the enhancer knows the generation parameters
  const contextParts: string[] = [
    `Dimensions: ${width}x${height}${width > height ? ' (landscape)' : width < height ? ' (portrait)' : ' (square)'}`,
  ];
  if (transparentBackground) {
    contextParts.push(
      'Transparent background: yes — the background will be removed. Focus on the subject as an isolated element.',
    );
  }
  if (hasReferenceImage) {
    contextParts.push(
      "Reference image: yes — a reference image is provided to the generation model alongside this prompt to guide style, subject, or composition. Complement it; don't re-describe what it already carries.",
    );
  }

  const context = `<context>\n${contextParts.join('\n')}\n</context>`;
  const message = `${SYSTEM_PROMPT}\n\n${context}\n\n<brief>\n${brief}\n</brief>`;

  const enhanced = await runMindstudioCli(
    [
      'generate-text',
      '--message',
      message,
      '--model-override',
      JSON.stringify({ model, config: { reasoning: 'false' } }),
    ],
    { outputKey: 'content', timeout: 60_000, onLog, caller: 'designExpert' },
  );

  return enhanced.trim();
}
