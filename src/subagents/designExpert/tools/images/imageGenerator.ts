/**
 * Shared image generation logic used by both generateImages and editImages.
 *
 * Handles prompt enhancement, generation, background removal, and analysis.
 * The underlying model is configured via the MindStudio CLI.
 */

import { runMindstudioCliResult } from '../../../common/runMindstudioCli.js';
import { analyzeImage } from '../../../common/analyzeImage.js';
import { resolveImageRefs } from '../../../../tools/_helpers/uploadImage.js';
import { enhanceImagePrompt } from './enhancePrompt.js';
import type { ApiConfig } from '../../../../config.js';

const ANALYZE_PROMPT =
  'You are reviewing this image for a visual designer sourcing assets for a project. Describe: what the image depicts, the mood and color palette, how the lighting and composition work, any text present in the image, whether there are any issues (artifacts, distortions), and how it could be used in a layout for an app or website. Be concise and practical. Respond only with your analysis as Markdown (starting with the title "Asset Review") and absolutely no other text. Do not use emojis - use unicode if you need symbols.';

export interface ImageGeneratorOptions {
  prompts: string[];
  width?: number;
  height?: number;
  /** Source images for editing (`editImages`) or a single reference image
   * for generation (`generateImages`, passed as `[referenceImage]`). Mapped
   * onto the chosen model's declared image input(s). URLs or local file
   * paths — generation runs on the platform, so local files are hosted first. */
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
  /** Whether to rewrite each brief via the prompt enhancer before
   * generation. True for `generateImages` (briefs are creative); false for
   * `editImages` (prompts are edit instructions). */
  enhancePrompts: boolean;
  /** Needed to host any `sourceImages` given as local file paths. */
  apiConfig?: ApiConfig;
}

export async function generateImageAssets(
  opts: ImageGeneratorOptions,
): Promise<string> {
  const {
    prompts,
    transparentBackground,
    enhancePrompts,
    onLog,
    apiConfig,
    imageGenerationModel: genModel,
    imageAnalysisModel,
    imagePromptEnhancerModel,
  } = opts;
  const sourceImages = opts.sourceImages?.length
    ? await resolveImageRefs(opts.sourceImages, apiConfig)
    : undefined;
  const width = opts.width || 2048;
  const height = opts.height || 2048;

  const config: Record<string, any> = { width, height };
  if (sourceImages?.length) {
    // Image models accept source images under different config keys (and
    // different shapes). The platform whitelists config against the chosen
    // model's declared inputs and drops the rest, so we set every known key
    // and let the selected model keep the one it declares. Shape matters:
    // array inputs (imageUrlArray) take all URLs; single inputs (imageUrl)
    // take the first. `image_prompt` (flux-pro-1.1-ultra) is intentionally
    // omitted, and `mask_image` is excluded (it's an inpainting mask).
    const [firstImage] = sourceImages;
    // Array inputs (imageUrlArray)
    config.images = sourceImages;
    config.source_images = sourceImages;
    config.image_ref = sourceImages;
    // Single inputs (imageUrl / text)
    config.image = firstImage;
    config.image_url = firstImage;
    config.source_image = firstImage;
    config.source = firstImage;
  }

  // Enhance briefs via LLM before generation. On for generate (briefs are
  // creative); off for edit (prompts are edit instructions). When a reference
  // image is present, tell the enhancer so it complements it rather than
  // re-describing it.
  const hasReference = !!sourceImages?.length;
  const enhancedPrompts = enhancePrompts
    ? await Promise.all(
        prompts.map((brief) =>
          enhanceImagePrompt({
            brief,
            width,
            height,
            transparentBackground,
            hasReferenceImage: hasReference,
            onLog,
            model: imagePromptEnhancerModel,
          }),
        ),
      )
    : prompts;

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
    const res = await runMindstudioCliResult(['generate-image'], {
      outputKey: 'imageUrl',
      jsonLogs: true,
      timeout: 200_000,
      onLog,
      stdin: step,
      caller: 'designExpert',
    });
    // Failure (spawn error, timeout, `(no response)`, or a JSON error body)
    // becomes an `Error: …` sentinel the downstream loops already handle.
    imageUrls = [res.ok ? res.value : `Error: ${res.value}`];
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
    const batchRes = await runMindstudioCliResult(['batch'], {
      jsonLogs: true,
      timeout: 200_000,
      onLog,
      stdin: JSON.stringify(steps),
      caller: 'designExpert',
    });
    if (!batchRes.ok) {
      return batchRes.value;
    }
    try {
      const parsed = JSON.parse(batchRes.value);
      imageUrls = parsed.map(
        (r: any) => r.output?.imageUrl ?? `Error: ${r.error}`,
      );
    } catch {
      return batchRes.value;
    }
  }

  // Remove backgrounds if requested
  if (transparentBackground) {
    imageUrls = await Promise.all(
      imageUrls.map(async (url) => {
        if (url.startsWith('Error')) {
          return url;
        }
        const result = await runMindstudioCliResult(
          ['remove-background-from-image', '--image-url', url],
          {
            outputKey: 'imageUrl',
            timeout: 200_000,
            onLog,
            caller: 'designExpert',
          },
        );
        // On failure keep the original image rather than dropping it.
        return result.ok ? result.value : url;
      }),
    );
  }

  // Analyze each image in parallel
  const images = await Promise.all(
    imageUrls.map(async (url, i) => {
      if (url.startsWith('Error')) {
        return {
          prompt: prompts[i],
          ...(enhancePrompts && { enhancedPrompt: enhancedPrompts[i] }),
          error: url,
        };
      }
      // A failed review shouldn't discard an image that generated fine, so
      // note it per image instead of failing the whole batch.
      const analysis = await analyzeImage({
        prompt: ANALYZE_PROMPT,
        image: url,
        onLog,
        model: imageAnalysisModel,
      })
        .then((r) => r.analysis)
        .catch((err: any) => `Could not review this image: ${err.message}`);
      return {
        url,
        prompt: prompts[i],
        ...(enhancePrompts && { enhancedPrompt: enhancedPrompts[i] }),
        analysis,
        width,
        height,
      };
    }),
  );

  return JSON.stringify({ images });
}
