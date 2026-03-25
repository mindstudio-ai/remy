/**
 * Shared Seedream generation logic used by both generateImages and editImages.
 */

import { runCli } from '../../common/runCli.js';

const ANALYZE_PROMPT =
  'You are reviewing this image for a visual designer sourcing assets for a project. Describe: what the image depicts, the mood and color palette, how the lighting and composition work, whether there are any issues (unwanted text, artifacts, distortions), and how it could be used in a layout (hero background, feature section, card texture, etc). Be concise and practical.';

export interface SeedreamOptions {
  prompts: string[];
  width?: number;
  height?: number;
  /** Source/reference image URLs for image-to-image editing. */
  sourceImages?: string[];
  transparentBackground?: boolean;
  onLog?: (line: string) => void;
}

export async function seedreamGenerate(opts: SeedreamOptions): Promise<string> {
  const { prompts, sourceImages, transparentBackground, onLog } = opts;
  const width = opts.width || 2048;
  const height = opts.height || 2048;

  const config: Record<string, any> = { width, height };
  if (sourceImages?.length) {
    config.images = sourceImages;
  }

  // Generate all images
  let imageUrls: string[];
  if (prompts.length === 1) {
    const step = JSON.stringify({
      prompt: prompts[0],
      imageModelOverride: {
        model: 'seedream-4.5',
        config,
      },
    });
    const url = await runCli(
      `mindstudio generate-image '${step}' --output-key imageUrl --no-meta`,
      { jsonLogs: true, timeout: 200_000, onLog },
    );
    imageUrls = [url];
  } else {
    const steps = prompts.map((prompt) => ({
      stepType: 'generateImage',
      step: {
        prompt,
        imageModelOverride: {
          model: 'seedream-4.5',
          config,
        },
      },
    }));
    const batchResult = await runCli(
      `mindstudio batch '${JSON.stringify(steps)}' --no-meta`,
      { jsonLogs: true, timeout: 200_000, onLog },
    );
    try {
      const parsed = JSON.parse(batchResult);
      imageUrls = parsed.results.map(
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
        return { prompt: prompts[i], error: url };
      }
      const analysis = await runCli(
        `mindstudio analyze-image --prompt ${JSON.stringify(ANALYZE_PROMPT)} --image-url ${JSON.stringify(url)} --output-key analysis --no-meta`,
        { timeout: 200_000, onLog },
      );
      return { url, prompt: prompts[i], analysis, width, height };
    }),
  );

  return JSON.stringify({ images });
}
