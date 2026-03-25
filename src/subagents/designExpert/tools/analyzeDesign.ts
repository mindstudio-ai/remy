import type { ToolDefinition } from '../../../api.js';
import { runCli } from '../../common/runCli.js';

const DESIGN_REFERENCE_PROMPT = `
You are analyzing a screenshot of a real website or app for a designer's personal technique/inspiration reference notes.

Analyze the image and think about what makes the site or app special and unique.  What is it doing that is unique, different, original, and creative? What makes it special? What isn't working? What doesn't look or feel good?

Then, provide the following analysis:

## Context
What is this page, and what does it look like? Very briefly note the industry/vertical and purpose, then describe the composition with enough context to frame the analysis that follows — what's on the page, where things are positioned, what does the viewport look and feel like. Give enough detail that someone who can't see the image could understand the spatial references in the techniques section. Do not mention specific brand names. Keep it concise.

## Colors
List the palette as hex values with short labels. Just the swatches — no "strategy" paragraph.

## Typography
Brief description of the types used on the page. If you can identify the actual typeface name, provide it, otherwise provide a concrete description (e.g., "ultra-condensed grotesque, ~900 weight, tracked tight at maybe -0.03em, all-caps"). Include size relationships if notable (e.g., "hero text is viewport-width, body is 14px").

## Techniques
Identify the specific design moves that make this page interesting and unique, described in terms of how a designer with a technical background would write them down as notes in their notebook for inspiration. Focus only on the non-obvious, hard-to-think-of techniques — the things that make this page gallery-worthy. Skip basics like "high contrast CTA" or "generous whitespace" that any competent designer already knows.

Respond only with your analysis as Markdown and absolutely no other text. Do not use emojis - use unicode if you need symbols.
`;

export const definition: ToolDefinition = {
  name: 'analyzeDesign',
  description:
    'Analyze the visual design of a website or image URL. Websites are automatically screenshotted first. If no prompt is provided, performs a full design reference analysis (mood, color, typography, layout, distinctiveness). Provide a custom prompt to ask a specific design question instead.',
  inputSchema: {
    type: 'object',
    properties: {
      url: {
        type: 'string',
        description:
          'URL to analyze. Can be an image URL or a website URL (will be screenshotted).',
      },
      prompt: {
        type: 'string',
        description:
          'Optional custom analysis prompt. If omitted, performs the standard design reference analysis.',
      },
    },
    required: ['url'],
  },
};

export async function execute(
  input: Record<string, any>,
  onLog?: (line: string) => void,
): Promise<string> {
  const url = input.url as string;
  const analysisPrompt = input.prompt || DESIGN_REFERENCE_PROMPT;

  // Detect if this is a website URL (needs screenshotting) or an image URL
  const isImageUrl = /\.(png|jpe?g|webp|gif|svg|avif)(\?|$)/i.test(url);

  let imageUrl = url;
  if (!isImageUrl) {
    // Screenshot the website first
    const ssUrl = await runCli(
      `mindstudio screenshot-url --url ${JSON.stringify(url)} --mode viewport --width 1440 --delay 2000 --output-key screenshotUrl --no-meta`,
      { timeout: 120_000, onLog },
    );
    if (ssUrl.startsWith('Error')) {
      return `Could not screenshot ${url}: ${ssUrl}`;
    }
    imageUrl = ssUrl;
  }

  const analysis = await runCli(
    `mindstudio analyze-image --prompt ${JSON.stringify(analysisPrompt)} --image-url ${JSON.stringify(imageUrl)} --output-key analysis --no-meta`,
    { timeout: 200_000, onLog },
  );
  return isImageUrl ? analysis : `Screenshot: ${imageUrl}\n\n${analysis}`;
}
