/**
 * Tool definitions for the design research sub-agent.
 *
 * All tools execute locally via the mindstudio CLI — no external
 * tool resolution needed.
 */

import { exec } from 'node:child_process';
import type { ToolDefinition } from '../../api.js';

const DESIGN_REFERENCE_PROMPT = `Analyze this website/app screenshot as a design reference. Assess:
1) Mood/aesthetic
2) Color palette with approximate hex values and palette strategy
3) Typography style
4) Layout composition (symmetric/asymmetric, grid structure, whitespace usage, content density)
5) What makes it distinctive and interesting vs generic AI-generated interfaces
Be specific and concise.`;

export const DESIGN_RESEARCH_TOOLS: ToolDefinition[] = [
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
    name: 'analyzeImage',
    description:
      'Analyze an image using a vision model with a custom prompt. Use when you have a specific question about an image (e.g., "what colors dominate this image?", "describe the typography choices").',
    inputSchema: {
      type: 'object',
      properties: {
        prompt: {
          type: 'string',
          description: 'What to analyze or extract from the image.',
        },
        imageUrl: {
          type: 'string',
          description: 'URL of the image to analyze.',
        },
      },
      required: ['prompt', 'imageUrl'],
    },
  },
  {
    name: 'analyzeDesignReference',
    description:
      'Analyze a screenshot or design image for design inspiration. Returns a structured analysis: mood/aesthetic, color palette with hex values, typography style, layout composition, and what makes it distinctive. Use this instead of analyzeImage when studying a design reference.',
    inputSchema: {
      type: 'object',
      properties: {
        imageUrl: {
          type: 'string',
          description: 'URL of the screenshot or design image to analyze.',
        },
      },
      required: ['imageUrl'],
    },
  },
  {
    name: 'screenshotAndAnalyze',
    description:
      'Screenshot a live URL and analyze it in one step. If no prompt is provided, performs a full design reference analysis (mood, color, typography, layout, distinctiveness). Provide a custom prompt to ask a specific question about the visual design instead.',
    inputSchema: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: 'The URL to screenshot.',
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
    name: 'searchStockPhotos',
    description:
      'Search Pexels for stock photos. Returns image URLs with descriptions. Use concrete, descriptive queries ("person working at laptop in modern office" not "business").',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'What kind of photo to search for.',
        },
      },
      required: ['query'],
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
    name: 'generateImages',
    description:
      'Generate images using AI (Seedream). Returns CDN URLs. Produces high-quality results for both photorealistic images and abstract/creative visuals. Pass multiple prompts to generate in parallel.',
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

function runCli(cmd: string): Promise<string> {
  return new Promise<string>((resolve) => {
    exec(
      cmd,
      { timeout: 60_000, maxBuffer: 1024 * 1024 },
      (err, stdout, stderr) => {
        if (stdout.trim()) {
          resolve(stdout.trim());
          return;
        }
        if (err) {
          resolve(`Error: ${stderr.trim() || err.message}`);
          return;
        }
        resolve('(no response)');
      },
    );
  });
}

export async function executeDesignTool(
  name: string,
  input: Record<string, any>,
): Promise<string> {
  switch (name) {
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

    case 'analyzeImage':
      return runCli(
        `mindstudio analyze-image --prompt ${JSON.stringify(input.prompt)} --image-url ${JSON.stringify(input.imageUrl)} --no-meta`,
      );

    case 'analyzeDesignReference':
      return runCli(
        `mindstudio analyze-image --prompt ${JSON.stringify(DESIGN_REFERENCE_PROMPT)} --image-url ${JSON.stringify(input.imageUrl)} --no-meta`,
      );

    case 'screenshotAndAnalyze': {
      // Step 1: fetch with screenshot
      const screenshotResult = await runCli(
        `mindstudio scrape-url --url ${JSON.stringify(input.url)} --page-options ${JSON.stringify(JSON.stringify({ onlyMainContent: true, screenshot: true }))} --no-meta`,
      );

      // Extract screenshot URL from the result
      const screenshotMatch = screenshotResult.match(
        /https:\/\/[^\s"']+(?:\.png|\.jpg|\.jpeg|\.webp|screenshot[^\s"']*)/i,
      );
      if (!screenshotMatch) {
        // Try parsing as JSON to find screenshotUrl field
        try {
          const parsed = JSON.parse(screenshotResult);
          const ssUrl =
            parsed.screenshot ||
            parsed.screenshotUrl ||
            parsed.content?.screenshotUrl;
          if (ssUrl) {
            const analysisPrompt = input.prompt || DESIGN_REFERENCE_PROMPT;
            const analysis = await runCli(
              `mindstudio analyze-image --prompt ${JSON.stringify(analysisPrompt)} --image-url ${JSON.stringify(ssUrl)} --no-meta`,
            );
            return `Screenshot: ${ssUrl}\n\n${analysis}`;
          }
        } catch {}
        return `Fetched ${input.url} but could not extract screenshot URL.\n\nPage content:\n${screenshotResult}`;
      }

      // Step 2: analyze the screenshot
      const analysisPrompt = input.prompt || DESIGN_REFERENCE_PROMPT;
      const analysis = await runCli(
        `mindstudio analyze-image --prompt ${JSON.stringify(analysisPrompt)} --image-url ${JSON.stringify(screenshotMatch[0])} --no-meta`,
      );
      return `Screenshot: ${screenshotMatch[0]}\n\n${analysis}`;
    }

    case 'searchStockPhotos': {
      const encodedQuery = encodeURIComponent(input.query);
      return runCli(
        `mindstudio scrape-url --url "https://www.pexels.com/search/${encodedQuery}/" --page-options '{"onlyMainContent": true}' --no-meta`,
      );
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

      if (prompts.length === 1) {
        // Single image — direct call
        const step = JSON.stringify({
          prompt: prompts[0],
          imageModelOverride: {
            model: 'seedream-4.5',
            config: { width, height },
          },
        });
        return runCli(
          `mindstudio generate-image '${step}' --output-key imageUrl --no-meta`,
        );
      }

      // Multiple images — batch call
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
      return runCli(`mindstudio batch '${JSON.stringify(steps)}' --no-meta`);
    }

    default:
      return `Error: unknown tool "${name}"`;
  }
}
