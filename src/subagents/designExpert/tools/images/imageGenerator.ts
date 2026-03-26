/**
 * Shared image generation logic used by both generateImages and editImages.
 *
 * Handles prompt enhancement, generation, background removal, and analysis.
 * The underlying model is configured via the MindStudio CLI.
 */

import { runCli } from '../../../common/runCli.js';
import { analyzeImage } from '../../../common/analyzeImage.js';
import { enhanceImagePrompt } from './enhancePrompt.js';

const ANALYZE_PROMPT =
  'You are reviewing this image for a visual designer sourcing assets for a project. Describe: what the image depicts, the mood and color palette, how the lighting and composition work, any text present in the image, whether there are any issues (artifacts, distortions), and how it could be used in a layout for an app or website. Be concise and practical. Respond only with your analysis as Markdown and absolutely no other text. Do not use emojis - use unicode if you need symbols.';

export type AspectRatio =
  | '1:1'
  | '16:9'
  | '9:16'
  | '3:4'
  | '4:3'
  | '2:3'
  | '3:2';

export interface ImageGeneratorOptions {
  prompts: string[];
  aspectRatio?: AspectRatio;
  /** Source/reference image URLs for image-to-image editing. */
  sourceImages?: string[];
  transparentBackground?: boolean;
  onLog?: (line: string) => void;
}

export async function generateImageAssets(
  opts: ImageGeneratorOptions,
): Promise<string> {
  const { prompts, sourceImages, transparentBackground, onLog } = opts;
  const aspectRatio = opts.aspectRatio || '1:1';

  const config: Record<string, any> = {
    aspect_ratio: aspectRatio,
    ...(sourceImages?.length && { source_images: sourceImages }),
  };

  // Enhance prompts via LLM before generation (generate only, not edits)
  const isEdit = !!sourceImages?.length;
  const enhancedPrompts = isEdit
    ? prompts
    : await Promise.all(
        prompts.map((brief) =>
          enhanceImagePrompt({
            brief,
            aspectRatio,
            transparentBackground,
            onLog,
          }),
        ),
      );

  // Generate all images
  let imageUrls: string[];
  if (enhancedPrompts.length === 1) {
    const step = JSON.stringify({
      prompt: enhancedPrompts[0],
      imageModelOverride: {
        model: 'gemini-3.1-flash-image',
        config,
      },
    });
    const url = await runCli(
      `mindstudio generate-image ${JSON.stringify(step)} --output-key imageUrl --no-meta`,
      { jsonLogs: true, timeout: 200_000, onLog },
    );
    imageUrls = [url];
  } else {
    const steps = enhancedPrompts.map((prompt) => ({
      stepType: 'generateImage',
      step: {
        prompt,
        imageModelOverride: {
          model: 'gemini-3.1-flash-image',
          config,
        },
      },
    }));
    const batchResult = await runCli(`mindstudio batch --no-meta`, {
      jsonLogs: true,
      timeout: 200_000,
      onLog,
      stdin: JSON.stringify(steps),
    });
    try {
      const parsed = JSON.parse(batchResult);
      imageUrls = parsed.map(
        (r: any) => r.output?.imageUrl ?? `Error: ${r.error}`,
      );
    } catch {
      return batchResult;
    }
  }

  // Remove backgrounds if requested
  if (transparentBackground) {
    imageUrls = await Promise.all(
      imageUrls.map(async (url) => {
        if (url.startsWith('Error')) {
          return url;
        }
        const result = await runCli(
          `mindstudio remove-background-from-image --image-url ${JSON.stringify(url)} --output-key imageUrl --no-meta`,
          { timeout: 200_000, onLog },
        );
        return result.startsWith('Error') ? url : result;
      }),
    );
  }

  // Analyze each image in parallel
  const images = await Promise.all(
    imageUrls.map(async (url, i) => {
      if (url.startsWith('Error')) {
        return {
          prompt: prompts[i],
          ...(!isEdit && { enhancedPrompt: enhancedPrompts[i] }),
          error: url,
        };
      }
      const analysis = await analyzeImage({
        prompt: ANALYZE_PROMPT,
        imageUrl: url,
        onLog,
      });
      return {
        url,
        prompt: prompts[i],
        ...(!isEdit && { enhancedPrompt: enhancedPrompts[i] }),
        analysis,
        aspectRatio,
      };
    }),
  );

  return JSON.stringify({ images });
}
