import type { ToolDefinition } from '../../../api.js';
import type { ToolExecutionContext } from '../../../tools/index.js';
import { analyzeImage } from '../../common/analyzeImage.js';
import { buildScreenshotAnalysisPrompt } from '../../../tools/_helpers/screenshot.js';
import { resolveModel } from '../../../models/surfaces.js';

export const definition: ToolDefinition = {
  clearable: true,
  name: 'analyzeImage',
  description:
    "Analyze an image using a vision model. Provides static image analysis only, will not capture animations or video. Returns an objective description of what is visible — shapes, colors, layout, text, artifacts. Use for factual inventory of image contents, not for subjective design judgment - the vision model providing the analysis has no sense of design. You are the design expert - use the analysis tool for factual inventory, then apply your own expertise for quality and suitability assessments. Optionally provide specific questions about what you're looking for. Use a bulleted list to ask many questions at once. If you are analyzing a screenshot of the app preview, you can reuse the same screenshot URL multiple times to ask multiple questions.",
  inputSchema: {
    type: 'object',
    properties: {
      // Still `imageUrl` even though a path works: the builder renders this
      // tool's thumbnail from `input.imageUrl` and deploys separately, so
      // renaming the property would blank the view under version skew.
      imageUrl: {
        type: 'string',
        description:
          'The image to analyze: either a URL, or the path of an image file on disk (e.g. a reference screenshot the user uploaded, under src/.user-uploads/). Local files are hosted automatically; the URL comes back in the result and can be reused for follow-up questions or embedded in a spec.',
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
  context?: ToolExecutionContext,
): Promise<string> {
  const prompt = buildScreenshotAnalysisPrompt({
    prompt: input.prompt as string | undefined,
  });

  const { url, analysis } = await analyzeImage({
    prompt,
    image: input.imageUrl as string,
    apiConfig: context?.apiConfig,
    onLog,
    model: resolveModel('imageAnalysis', context?.models, context?.model),
  });
  return JSON.stringify({ url, analysis });
}
