import type { ToolDefinition } from '../../../api.js';
import { seedreamGenerate } from './_seedream.js';

export const definition: ToolDefinition = {
  name: 'generateImages',
  description:
    'Generate images using AI. Returns CDN URLs with a quality analysis for each image. Produces high-quality results for everything from photorealistic images and abstract/creative visuals. Pass multiple prompts to generate in parallel. No need to analyze images separately after generating — the analysis is included.',
  inputSchema: {
    type: 'object',
    properties: {
      prompts: {
        type: 'array',
        items: {
          type: 'string',
        },
        description:
          'One or more image generation prompts. Be detailed: describe style, mood, composition, colors. Multiple prompts run in parallel.',
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
  return seedreamGenerate({
    prompts: input.prompts as string[],
    width: input.width as number | undefined,
    height: input.height as number | undefined,
    transparentBackground: input.transparentBackground as boolean | undefined,
    onLog,
  });
}
