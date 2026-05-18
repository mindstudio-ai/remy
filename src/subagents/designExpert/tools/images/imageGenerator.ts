/**
 * Shared image generation logic used by both generateImages and editImages.
 *
 * Handles prompt enhancement, generation, background removal, and analysis.
 * The underlying model is configured via the MindStudio CLI.
 */

import { runMindstudioCli } from '../../../common/runMindstudioCli.js';
import { analyzeImage } from '../../../common/analyzeImage.js';
import { enhanceImagePrompt } from './enhancePrompt.js';

const ANALYZE_PROMPT =
  'You are reviewing this image for a visual designer sourcing assets for a project. Describe: what the image depicts, the mood and color palette, how the lighting and composition work, any text present in the image, whether there are any issues (artifacts, distortions), and how it could be used in a layout for an app or website. Be concise and practical. Respond only with your analysis as Markdown (starting with the title "Asset Review") and absolutely no other text. Do not use emojis - use unicode if you need symbols.';

export interface ImageGeneratorOptions {
  prompts: string[];
  width?: number;
  height?: number;
  /** Source/reference image URLs for image-to-image editing. */
  sourceImages?: string[];
  transparentBackground?: boolean;
  onLog?: (line: string) => void;
  /** Authoritative image-generation model ID. Resolved via
   * `resolveModel('imageGeneration', ...)` by the caller. */
  imageGenerationModel: string;
  /** Authoritative vision model ID for analyzing generated images.
   * Resolved via `resolveModel('imageAnalysis', ...)` by the caller. */
  imageAnalysisModel: string;
  /** Authoritative model ID for the text LLM that rewrites image briefs.
   * Resolved via `resolveModel('imagePromptEnhancer', ...)` by the caller. */
  imagePromptEnhancerModel: string;
}

export async function generateImageAssets(
  opts: ImageGeneratorOptions,
): Promise<string> {
  const {
    prompts,
    sourceImages,
    transparentBackground,
    onLog,
    imageGenerationModel: genModel,
    imageAnalysisModel,
    imagePromptEnhancerModel,
  } = opts;
  const width = opts.width || 2048;
  const height = opts.height || 2048;

  const config: Record<string, any> = { width, height };
  if (sourceImages?.length) {
    config.images = sourceImages;
  }

  // Enhance prompts via LLM before generation (generate only, not edits)
  const isEdit = !!sourceImages?.length;
  const enhancedPrompts = isEdit
    ? prompts
    : await Promise.all(
        prompts.map((brief) =>
          enhanceImagePrompt({
            brief,
            width,
            height,
            transparentBackground,
            onLog,
            model: imagePromptEnhancerModel,
          }),
        ),
      );

  // Generate all images
  let imageUrls: string[];
  if (enhancedPrompts.length === 1) {
    const step = JSON.stringify({
      prompt: enhancedPrompts[0],
      imageModelOverride: {
        model: genModel,
        config,
      },
    });
    const url = await runMindstudioCli(['generate-image'], {
      outputKey: 'imageUrl',
      jsonLogs: true,
      timeout: 200_000,
      onLog,
      stdin: step,
      caller: 'designExpert',
    });
    imageUrls = [url];
  } else {
    const steps = enhancedPrompts.map((prompt) => ({
      stepType: 'generateImage',
      step: {
        prompt,
        imageModelOverride: {
          model: genModel,
          config,
        },
      },
    }));
    const batchResult = await runMindstudioCli(['batch'], {
      jsonLogs: true,
      timeout: 200_000,
      onLog,
      stdin: JSON.stringify(steps),
      caller: 'designExpert',
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
        const result = await runMindstudioCli(
          ['remove-background-from-image', '--image-url', url],
          {
            outputKey: 'imageUrl',
            timeout: 200_000,
            onLog,
            caller: 'designExpert',
          },
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
        model: imageAnalysisModel,
      });
      return {
        url,
        prompt: prompts[i],
        ...(!isEdit && { enhancedPrompt: enhancedPrompts[i] }),
        analysis,
        width,
        height,
      };
    }),
  );

  return JSON.stringify({ images });
}
