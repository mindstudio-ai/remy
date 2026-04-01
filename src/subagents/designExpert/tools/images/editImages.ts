import type { ToolDefinition } from '../../../../api.js';
import { generateImageAssets } from './imageGenerator.js';

export const definition: ToolDefinition = {
  clearable: false,
  name: 'editImages',
  description:
    'Edit or transform existing images. Provide one or more source image URLs as reference and a prompt describing the desired edit. Use for compositing, style transfer, subject transformation, blending multiple references, or incorporating one or more references into something new. Returns CDN URLs with analysis.',
  inputSchema: {
    type: 'object',
    properties: {
      prompts: {
        type: 'array',
        items: {
          type: 'string',
        },
        description:
          'One or more edit briefs describing the desired transformation. Focus on what to change relative to the source material. Multiple briefs run in parallel, each using the same source images.',
      },
      sourceImages: {
        type: 'array',
        items: {
          type: 'string',
        },
        description:
          'One or more source/reference image URLs. These are used as the basis for the edit — the AI will use them as reference for style, subject, or composition.',
      },
      width: {
        type: 'number',
        description: 'Output width in pixels. Default 2048. Range: 2048-4096.',
      },
      height: {
        type: 'number',
        description: 'Output height in pixels. Default 2048. Range: 2048-4096.',
      },
      transparentBackground: {
        type: 'boolean',
        description:
          'Remove the background from output images, producing transparent PNGs.',
      },
    },
    required: ['prompts', 'sourceImages'],
  },
};

export async function execute(
  input: Record<string, any>,
  onLog?: (line: string) => void,
): Promise<string> {
  return generateImageAssets({
    prompts: input.prompts as string[],
    sourceImages: input.sourceImages as string[],
    width: input.width as number | undefined,
    height: input.height as number | undefined,
    transparentBackground: input.transparentBackground as boolean | undefined,
    onLog,
  });
}
