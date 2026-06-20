import type { ToolDefinition } from '../../../../api.js';
import type { ToolExecutionContext } from '../../../../tools/index.js';
import { generateImageAssets } from './imageGenerator.js';
import { resolveModel } from '../../../../models/surfaces.js';

export const definition: ToolDefinition = {
  clearable: false,
  name: 'generateImages',
  description:
    'Generate images. Returns CDN URLs with a quality analysis for each image. Produces high-quality results for everything from photorealistic images and abstract/creative visuals. Pass multiple prompts to generate in parallel. No need to analyze images separately after generating — the analysis is included.',
  inputSchema: {
    type: 'object',
    properties: {
      prompts: {
        type: 'array',
        items: {
          type: 'string',
        },
        description:
          'One or more image briefs describing what you want. Focus on subject, mood, style, and intended use — the tool optimizes your brief into a model-ready prompt automatically. Multiple briefs run in parallel.',
      },
      referenceImage: {
        type: 'string',
        description:
          'Optional URL of a single reference image to guide the generation — for style, subject, character consistency, or composition. Your prompt still describes the desired result; the reference conditions it. Applies to every prompt in the batch.',
      },
      width: {
        type: 'number',
        description: 'Image width in pixels. Default 2048. Range: 2048-4096.',
      },
      height: {
        type: 'number',
        description: 'Image height in pixels. Default 2048. Range: 2048-4096.',
      },
      transparentBackground: {
        type: 'boolean',
        description:
          'Remove the background from generated images, producing transparent PNGs trimmed to the subject bounds. Useful for icons, logos, product shots, and assets that need to be composited onto other backgrounds.',
      },
    },
    required: ['prompts'],
  },
};

export async function execute(
  input: Record<string, any>,
  onLog?: (line: string) => void,
  context?: ToolExecutionContext,
): Promise<string> {
  return generateImageAssets({
    prompts: input.prompts as string[],
    width: input.width as number | undefined,
    height: input.height as number | undefined,
    transparentBackground: input.transparentBackground as boolean | undefined,
    sourceImages: input.referenceImage
      ? [input.referenceImage as string]
      : undefined,
    enhancePrompts: true,
    onLog,
    imageGenerationModel: resolveModel(
      'imageGeneration',
      context?.models,
      context?.model,
    ),
    imageAnalysisModel: resolveModel(
      'imageAnalysis',
      context?.models,
      context?.model,
    ),
    imagePromptEnhancerModel: resolveModel(
      'imagePromptEnhancer',
      context?.models,
      context?.model,
    ),
  });
}
