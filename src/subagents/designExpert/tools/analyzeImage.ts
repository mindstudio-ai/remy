import type { ToolDefinition } from '../../../api.js';
import { runCli } from '../../common/runCli.js';

const DEFAULT_PROMPT =
  'Describe everything visible in this image — every element, its position, its size relative to the frame, its colors, its content. Be comprhensive, thorough and spatial. After the inventory, note anything that looks visually broken (overlapping elements, clipped text, misaligned components). Respond only with your analysis as Markdown and absolutely no other text. Do not use emojis - use unicode if you need symbols.';

export const definition: ToolDefinition = {
  name: 'analyzeImage',
  description:
    'Analyze an image by URL. Returns a detailed description of everything visible. Provide a custom prompt to ask a specific question instead of the default full description.',
  inputSchema: {
    type: 'object',
    properties: {
      imageUrl: {
        type: 'string',
        description: 'The image URL to analyze.',
      },
      prompt: {
        type: 'string',
        description:
          'Optional custom analysis prompt. If omitted, describes everything visible in the image.',
      },
    },
    required: ['imageUrl'],
  },
};

export async function execute(
  input: Record<string, any>,
  onLog?: (line: string) => void,
): Promise<string> {
  const imageUrl = input.imageUrl as string;
  const prompt = (input.prompt as string) || DEFAULT_PROMPT;

  const analysis = await runCli(
    `mindstudio analyze-image --prompt ${JSON.stringify(prompt)} --image-url ${JSON.stringify(imageUrl)} --output-key analysis --no-meta`,
    { timeout: 200_000, onLog },
  );
  return JSON.stringify({ url: imageUrl, analysis });
}
