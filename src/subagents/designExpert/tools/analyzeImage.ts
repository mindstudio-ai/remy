import type { ToolDefinition } from '../../../api.js';
import { analyzeImage } from '../../common/analyzeImage.js';

const DEFAULT_PROMPT =
  'Describe everything visible in this image — every element, its position, its size relative to the frame, its colors, its content. Be comprehensive, thorough and spatial. After the inventory, note anything that looks visually broken (overlapping elements, clipped text, misaligned components). Respond only with your analysis as Markdown and absolutely no other text. Do not use emojis - use unicode if you need symbols.';

export const definition: ToolDefinition = {
  clearable: true,
  name: 'analyzeImage',
  description:
    "Analyze an image by URL using a vision model. Provides static image analysis only, will not capture animations or video. Returns an objective description of what is visible — shapes, colors, layout, text, artifacts. Use for factual inventory of image contents, not for subjective design judgment - the vision model providing the analysis has no sense of design. You are the design expert - use the analysis tool for factual inventory, then apply your own expertise for quality and suitability assessments. Optionally provide specific questions about what you're looking for. Use a bulleted list to ask many questions at once. If you are analyzing a screenshot of the app preview, you can reuse the same screenshot URL multiple times to ask multiple questions.",
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

  const analysis = await analyzeImage({
    prompt,
    imageUrl,
    onLog,
  });
  return JSON.stringify({ url: imageUrl, analysis });
}
