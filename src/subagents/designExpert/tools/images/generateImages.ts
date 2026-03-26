import type { ToolDefinition } from '../../../../api.js';
import { generateImageAssets } from './imageGenerator.js';

export const definition: ToolDefinition = {
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
      aspectRatio: {
        type: 'string',
        enum: ['1:1', '16:9', '9:16', '3:4', '4:3', '2:3', '3:2'],
        description: 'Aspect ratio. Default 1:1.',
      },
      transparentBackground: {
        type: 'boolean',
        description:
          'Remove the background from generated images, producing transparent PNGs. Useful for icons, logos, product shots, and assets that need to be composited onto other backgrounds.',
      },
    },
    required: ['prompts'],
  },
};

export async function execute(
  input: Record<string, any>,
  onLog?: (line: string) => void,
): Promise<string> {
  return generateImageAssets({
    prompts: input.prompts as string[],
    aspectRatio: input.aspectRatio as
      | import('./imageGenerator.js').AspectRatio
      | undefined,
    transparentBackground: input.transparentBackground as boolean | undefined,
    onLog,
  });
}
