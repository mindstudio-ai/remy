/**
 * Tool definitions for the visual design expert sub-agent.
 */

import fs from 'node:fs';
import path from 'node:path';
import type { ToolDefinition } from '../../api.js';
import type { ToolExecutionContext } from '../../tools/index.js';
import { runCli } from '../common/runCli.js';
import { captureAndAnalyzeScreenshot } from '../../tools/_helpers/screenshot.js';
import { browserAutomationTool } from '../browserAutomation/index.js';

const base =
  import.meta.dirname ?? path.dirname(new URL(import.meta.url).pathname);

function resolvePath(filename: string): string {
  const local = path.join(base, filename);
  return fs.existsSync(local)
    ? local
    : path.join(base, 'subagents', 'designExpert', filename);
}

const DESIGN_REFERENCE_PROMPT = fs
  .readFileSync(resolvePath('prompts/tool-prompts/design-analysis.md'), 'utf-8')
  .trim();

export const DESIGN_EXPERT_TOOLS: ToolDefinition[] = [
  {
    name: 'searchGoogle',
    description:
      'Search Google for web results. Use for finding design inspiration, font recommendations, UI patterns, real products in a domain, and reference material.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'The search query.',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'fetchUrl',
    description:
      'Fetch the content of a web page as markdown. Optionally capture a screenshot to see the visual design. Use to analyze reference sites, read font specimen pages, or extract design details.',
    inputSchema: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: 'The URL to fetch.',
        },
        screenshot: {
          type: 'boolean',
          description:
            'Capture a screenshot of the page. Use when you need to see the visual design, not just the text.',
        },
      },
      required: ['url'],
    },
  },
  {
    name: 'analyzeReferenceImageOrUrl',
    description:
      'Analyze any visual — pass an image URL or a website URL. Websites are automatically screenshotted first. If no prompt is provided, performs a full design reference analysis (mood, color, typography, layout, distinctiveness). Provide a custom prompt to ask a specific question instead.',
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
  },
  {
    name: 'screenshot',
    description:
      'Capture a screenshot of the app preview. Returns a CDN URL with visual analysis. Use to review the current state of the UI being built. Set viewportOnly to capture just what the user sees on screen.',
    inputSchema: {
      type: 'object',
      properties: {
        prompt: {
          type: 'string',
          description: 'Optional specific question about the screenshot.',
        },
        viewportOnly: {
          type: 'boolean',
          description:
            'Capture only the visible viewport instead of the full scrollable page. Use when checking above-the-fold layout or viewport-relative sizing like 100vh.',
        },
      },
    },
  },
  {
    name: 'searchProductScreenshots',
    description:
      'Search for screenshots of real products and apps. Use to find what existing products look like ("stripe dashboard", "linear app", "notion workspace"). Returns image results of actual product UI. Use this for layout and design research on real products, NOT for abstract design inspiration.',
    inputSchema: {
      type: 'object',
      properties: {
        product: {
          type: 'string',
          description:
            'The product or app to find screenshots of (e.g., "stripe dashboard", "figma editor", "mercury banking app").',
        },
      },
      required: ['product'],
    },
  },
  {
    name: 'runBrowserTest',
    description:
      'Run an automated browser test against the live app preview. Use to verify visual implementation: check computed styles, navigate between pages, take analyzed screenshots. Describe what you want to verify and the browser agent handles the interaction.',
    inputSchema: {
      type: 'object',
      properties: {
        task: {
          type: 'string',
          description:
            'What to verify, in natural language. E.g., "Check that the hero section cards have border-radius: 24px and the correct rotation angles" or "Navigate to /about and screenshot it".',
        },
      },
      required: ['task'],
    },
  },
  {
    name: 'generateImages',
    description:
      'Generate images using AI (Seedream). Returns CDN URLs with a quality analysis for each image. Produces high-quality results for both photorealistic images and abstract/creative visuals. Pass multiple prompts to generate in parallel. No need to analyze images separately after generating — the analysis is included.',
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
          description:
            'Image height in pixels. Default 2048. Range: 2048-4096.',
        },
      },
      required: ['prompts'],
    },
  },
];

export async function executeDesignExpertTool(
  name: string,
  input: Record<string, any>,
  context?: ToolExecutionContext,
): Promise<string> {
  switch (name) {
    case 'screenshot': {
      try {
        return await captureAndAnalyzeScreenshot({
          prompt: input.prompt as string,
          viewportOnly: input.viewportOnly as boolean,
        });
      } catch (err: any) {
        return `Error taking screenshot: ${err.message}`;
      }
    }

    case 'searchGoogle':
      return runCli(
        `mindstudio search-google --query ${JSON.stringify(input.query)} --export-type json --output-key results --no-meta`,
      );

    case 'fetchUrl': {
      const pageOptions: Record<string, any> = { onlyMainContent: true };
      if (input.screenshot) {
        pageOptions.screenshot = true;
      }
      return runCli(
        `mindstudio scrape-url --url ${JSON.stringify(input.url)} --page-options ${JSON.stringify(JSON.stringify(pageOptions))} --no-meta`,
      );
    }

    case 'analyzeReferenceImageOrUrl': {
      const url = input.url as string;
      const analysisPrompt = input.prompt || DESIGN_REFERENCE_PROMPT;

      // Detect if this is a website URL (needs screenshotting) or an image URL
      const isImageUrl = /\.(png|jpe?g|webp|gif|svg|avif)(\?|$)/i.test(url);

      let imageUrl = url;
      if (!isImageUrl) {
        // Screenshot the website first
        const ssUrl = await runCli(
          `mindstudio screenshot-url --url ${JSON.stringify(url)} --mode viewport --width 1440 --delay 2000 --output-key screenshotUrl --no-meta`,
        );
        if (ssUrl.startsWith('Error')) {
          return `Could not screenshot ${url}: ${ssUrl}`;
        }
        imageUrl = ssUrl;
      }

      const analysis = await runCli(
        `mindstudio analyze-image --prompt ${JSON.stringify(analysisPrompt)} --image-url ${JSON.stringify(imageUrl)} --output-key analysis --no-meta`,
      );
      return isImageUrl ? analysis : `Screenshot: ${imageUrl}\n\n${analysis}`;
    }

    case 'searchProductScreenshots': {
      const query = `${input.product} product screenshot UI 2026`;
      return runCli(
        `mindstudio search-google-images --query ${JSON.stringify(query)} --export-type json --output-key images --no-meta`,
      );
    }

    case 'generateImages': {
      const prompts = input.prompts as string[];
      const width = (input.width as number) || 2048;
      const height = (input.height as number) || 2048;

      const ANALYZE_PROMPT =
        'You are reviewing this image for a visual designer sourcing assets for a project. Describe: what the image depicts, the mood and color palette, how the lighting and composition work, whether there are any issues (unwanted text, artifacts, distortions), and how it could be used in a layout (hero background, feature section, card texture, etc). Be concise and practical.';

      // Generate all images
      let imageUrls: string[];
      if (prompts.length === 1) {
        const step = JSON.stringify({
          prompt: prompts[0],
          imageModelOverride: {
            model: 'seedream-4.5',
            config: { width, height },
          },
        });
        const url = await runCli(
          `mindstudio generate-image '${step}' --output-key imageUrl --no-meta`,
        );
        imageUrls = [url];
      } else {
        const steps = prompts.map((prompt) => ({
          stepType: 'generateImage',
          step: {
            prompt,
            imageModelOverride: {
              model: 'seedream-4.5',
              config: { width, height },
            },
          },
        }));
        const batchResult = await runCli(
          `mindstudio batch '${JSON.stringify(steps)}' --no-meta`,
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

      // Analyze each image in parallel
      const analyses = await Promise.all(
        imageUrls.map(async (url, i) => {
          if (url.startsWith('Error')) {
            return `Image ${i + 1}: ${url}`;
          }
          const analysis = await runCli(
            `mindstudio analyze-image --prompt ${JSON.stringify(ANALYZE_PROMPT)} --image-url ${JSON.stringify(url)} --output-key analysis --no-meta`,
          );
          return `**Image ${i + 1}:** ${url}\nPrompt: ${prompts[i]}\nAnalysis: ${analysis}`;
        }),
      );

      return analyses.join('\n\n');
    }

    case 'runBrowserTest': {
      if (!context) {
        return 'Error: browser testing requires execution context (only available in headless mode)';
      }
      return browserAutomationTool.execute({ task: input.task }, context);
    }

    default:
      return `Error: unknown tool "${name}"`;
  }
}
