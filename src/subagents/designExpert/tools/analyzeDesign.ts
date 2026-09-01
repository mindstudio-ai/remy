/**
 * Look at something and describe its design: a website, an image, or an HTML
 * document on disk.
 *
 * Three targets, three routes. A website is screenshotted platform-side and
 * analyzed; an image (URL or local file) goes straight to vision, uploading
 * first if it's local; a local HTML file is rendered in the sandbox browser
 * and the render is analyzed. That last route exists because the platform
 * screenshotter fetches from the public internet, so it cannot see the
 * sandbox disk — which is where the design agent's own wireframes live. Its
 * wireframes are the one artifact it authors without ever seeing rendered
 * (`createWireframe` hands back a path, not a review), so a local path used to
 * fall through to the website branch and come back "could not screenshot".
 */

import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import type { ToolDefinition } from '../../../api.js';
import type { ToolExecutionContext } from '../../../tools/index.js';
import { runMindstudioCliResult } from '../../common/runMindstudioCli.js';
import { analyzeImage } from '../../common/analyzeImage.js';
import { resolveModel } from '../../../models/surfaces.js';
import { isFetchableUrl } from '../../../tools/_helpers/uploadImage.js';
import { renderHtmlViaSidecar } from '../../../tools/_helpers/screenshot.js';
import { acquireBrowserLock } from '../../../tools/_helpers/browserLock.js';
import { PROJECT_ROOT } from '../../../projectRoot.js';
import { RENDER_ANALYZE_PROMPT } from './images/renderImage.js';

const DESIGN_REFERENCE_PROMPT = `
You are analyzing a screenshot of a real website or app for a designer's personal technique/inspiration reference notes.

Analyze the image and think about what makes the site or app special and unique.  What is it doing that is unique, different, original, and creative? What makes it special? What isn't working? What doesn't look or feel good?

Important: First, look at the screenshot and use your judgement to identify what the user wants notes about. If the screenshot is of a website for design case studies, or a blog post writeup about a new product or design, assume that the user is interested in a reference for the site/app/product being talked about - it is unlikely they are interested in a design audit of dribble.com, for example.

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
    'Analyze the visual design of a website, an image (URL or file on disk), or an HTML document on disk. Websites are screenshotted first; an HTML file is rendered in a real browser first and the render is analyzed, which is how you look at a wireframe you authored. Provides static image analysis only, will not capture animations or video. With no prompt, a website or image gets a full design reference analysis (mood, color, typography, layout, distinctiveness) and a rendered HTML document gets a fidelity review (clipping, overflow, webfont loading, alignment). Provide a custom prompt to ask a specific design question instead. Use a bulleted list to ask many questions at once.',
  inputSchema: {
    type: 'object',
    properties: {
      url: {
        type: 'string',
        description:
          'What to analyze: a website URL (will be screenshotted), an image URL, the path of an image file on disk (e.g. a reference the user uploaded, under src/.user-uploads/), or the path of an HTML file on disk (rendered in a browser, then analyzed). Local files are hosted automatically and their URL comes back in the result.',
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

/** Routes a target to vision rather than to the website screenshotter. What
 * can actually be *hosted* is decided by uploadLocalImage's CONTENT_TYPES —
 * this only answers "image, not web page", and a local file that can't be
 * hosted reports the supported list itself. */
const IMAGE_EXT_RE = /\.(png|jpe?g|webp|gif|svg|avif)(\?|$)/i;

const HTML_EXTS = new Set(['.html', '.htm']);

/** Render width for a local HTML document, and the viewport height it starts
 * at before `autoHeight` fits it to the document. The start height still
 * matters twice: it's the layout viewport a `100vh` document resolves
 * against, and it's what a tunnel too old to know the flag captures at. */
const HTML_RENDER_WIDTH = 1280;
const HTML_RENDER_START_HEIGHT = 1400;

/**
 * Split `name`/`description` frontmatter off an authored HTML document, same
 * shape as the reader in skillCatalog.ts. `createWireframe` writes it, and
 * rendering it verbatim would paint the YAML across the top of the page. The
 * two fields are worth keeping: they tell the vision model what it is looking
 * at. A document with no frontmatter passes through whole.
 */
function splitFrontmatter(raw: string): {
  name?: string;
  description?: string;
  html: string;
} {
  const match = raw.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!match) {
    return { html: raw };
  }
  const fields: Record<string, string> = {};
  for (const line of match[1].split('\n')) {
    const idx = line.indexOf(':');
    if (idx > 0) {
      fields[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
    }
  }
  return {
    name: fields.name,
    description: fields.description,
    html: raw.slice(match[0].length),
  };
}

export async function execute(
  input: Record<string, any>,
  onLog?: (line: string) => void,
  context?: ToolExecutionContext,
): Promise<string> {
  const url = String(input.url ?? '').trim();
  if (!url) {
    return 'Error: url is required.';
  }
  const customPrompt =
    typeof input.prompt === 'string' && input.prompt.trim()
      ? input.prompt
      : undefined;

  // Local paths are decided first and never fall through to the website
  // branch: that screenshotter runs platform-side and fetches from the public
  // internet, so it can't see the sandbox disk. A path arriving there is where
  // "could not screenshot src/..." came from.
  if (!isFetchableUrl(url)) {
    if (HTML_EXTS.has(extname(url).toLowerCase())) {
      return analyzeLocalHtml(url, customPrompt, onLog, context);
    }
    return analyze(
      url,
      customPrompt ?? DESIGN_REFERENCE_PROMPT,
      onLog,
      context,
    );
  }

  if (IMAGE_EXT_RE.test(url)) {
    return analyze(
      url,
      customPrompt ?? DESIGN_REFERENCE_PROMPT,
      onLog,
      context,
    );
  }

  // A web page: screenshot it platform-side, then analyze the capture.
  const ss = await runMindstudioCliResult(
    [
      'screenshot-url',
      '--url',
      url,
      '--mode',
      'viewport',
      '--width',
      '1440',
      '--delay',
      '2000',
    ],
    {
      outputKey: 'screenshotUrl',
      timeout: 120_000,
      onLog,
      caller: 'designExpert',
    },
  );
  // Covers spawn errors, `(no response)`, and JSON error bodies — not just
  // the `Error:`-prefixed string the old `startsWith('Error')` caught.
  if (!ss.ok) {
    return `Could not screenshot ${url}: ${ss.value}`;
  }
  return analyze(
    ss.value,
    customPrompt ?? DESIGN_REFERENCE_PROMPT,
    onLog,
    context,
  );
}

/** Analyze something the platform can already fetch, or a local image (which
 * analyzeImage uploads on its way in). */
async function analyze(
  image: string,
  prompt: string,
  onLog?: (line: string) => void,
  context?: ToolExecutionContext,
  extra?: Record<string, unknown>,
): Promise<string> {
  const analyzed = await analyzeImage({
    prompt,
    image,
    apiConfig: context?.apiConfig,
    onLog,
    model: resolveModel('imageAnalysis', context?.models, context?.model),
  });
  return JSON.stringify({
    url: analyzed.url,
    analysis: analyzed.analysis,
    ...extra,
  });
}

/**
 * Render a local HTML document in the sandbox browser, then analyze the
 * render. The capture stays in dev-session scratch storage — unlike
 * renderImage, this is a review of an artifact rather than a deliverable, so
 * there's nothing to re-host durably.
 */
async function analyzeLocalHtml(
  path: string,
  customPrompt: string | undefined,
  onLog?: (line: string) => void,
  context?: ToolExecutionContext,
): Promise<string> {
  let raw: string;
  try {
    raw = await readFile(join(PROJECT_ROOT, path), 'utf8');
  } catch {
    return `No file at "${path}". Paths resolve from the project root; list the directory to check the name.`;
  }

  const { name, description, html } = splitFrontmatter(raw);
  if (!html.trim()) {
    return `"${path}" has no HTML to render.`;
  }

  // A fresh tab of the one software-rasterizing Chrome, so serialize with
  // screenshots, renders, and browser automation.
  onLog?.(`Rendering ${path} in the sandbox browser...`);
  const release = await acquireBrowserLock();
  let rendered: { url: string; width: number; height: number };
  try {
    rendered = await renderHtmlViaSidecar({
      html,
      width: HTML_RENDER_WIDTH,
      height: HTML_RENDER_START_HEIGHT,
      autoHeight: true,
    });
  } catch (err: any) {
    return `Could not render ${path}: ${err?.message ?? err}`;
  } finally {
    release();
  }

  // The design-reference prompt mines someone else's site for technique,
  // which is the wrong question for a document the agent wrote itself. Default
  // to the same fidelity review renderImage uses: did the browser realize it.
  const basePrompt = customPrompt ?? RENDER_ANALYZE_PROMPT;
  const subject = [name, description].filter(Boolean).join(' — ');
  const prompt = subject
    ? `The document rendered below is described by its author as: ${subject}\n\n${basePrompt}`
    : basePrompt;

  return analyze(rendered.url, prompt, onLog, context, {
    renderedWidth: rendered.width,
    renderedHeight: rendered.height,
  });
}
