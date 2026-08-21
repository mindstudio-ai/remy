/**
 * Deterministic HTML→image rendering: the design expert authors a
 * self-contained HTML document, the sandbox browser renders it in a fresh tab,
 * and the capture comes back as a durably hosted PNG plus a fidelity review.
 *
 * The third sibling in the images family. generateImages/editImages are the
 * image model (organic, photographic, 3D-emoji icons); renderImage is the
 * browser — for anything token-exact (share cards, wordmarks, flat/geometric
 * icon tiles) where a generation model can't hit exact hexes, real fonts, or
 * precise geometry.
 */

import { mkdir, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve, sep } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { ToolDefinition } from '../../../../api.js';
import type { ToolExecutionContext } from '../../../../tools/index.js';
import { renderHtmlViaSidecar } from '../../../../tools/_helpers/screenshot.js';
import { acquireBrowserLock } from '../../../../tools/_helpers/browserLock.js';
import { runMindstudioCliResult } from '../../../common/runMindstudioCli.js';
import { analyzeImage } from '../../../common/analyzeImage.js';
import { resolveModel } from '../../../../models/surfaces.js';
import { PROJECT_ROOT } from '../../../../projectRoot.js';

const MIN_DIMENSION = 16;
const MAX_DIMENSION = 4096;

// Fidelity review, not asset review: a render is the agent's own composition
// coming back as pixels, so the questions are whether the browser realized it
// faithfully — not what the image depicts.
const RENDER_ANALYZE_PROMPT =
  'You are reviewing a browser-rendered graphic (composed from HTML/CSS by a designer) for fidelity. Report: whether the composition fills the full canvas or leaves unintended gaps at any edge, any clipped or overflowing text, whether custom webfonts appear to have loaded (distinctive letterforms vs generic fallback serif/sans), any misalignment or uneven spacing, any unintended scrollbars or default-styling artifacts, and — if the background is transparent — any fringing or stray opaque pixels at the edges. Then briefly describe the overall composition and how polished it looks. Be concise and practical. Respond only with your analysis as Markdown (starting with the title "Render Review") and absolutely no other text. Do not use emojis - use unicode if you need symbols.';

export const definition: ToolDefinition = {
  name: 'renderImage',
  description:
    'Render a self-contained HTML document in a real browser and capture it as a hosted PNG at exact pixel dimensions, with a fidelity review included. Deterministic — exact hex colors, real loaded webfonts, precise geometry — unlike generateImages, which is an image model. Use for token-exact graphics: Open Graph share cards, wordmarks, flat/geometric icon tiles, badges, any composition where letterforms and spacing carry the design. Compose with HTML/CSS (link webfonts from CDNs — the renderer waits for them to load); inline existing SVG markup when needed, but never hand-write new SVG path data.',
  inputSchema: {
    type: 'object',
    properties: {
      html: {
        type: 'string',
        description:
          'A complete, self-contained HTML document sized to fill the viewport (style html/body to the full dimensions with margin 0). External webfonts and images from CDNs are fine — loading is awaited before capture.',
      },
      width: {
        type: 'number',
        description:
          'Viewport width in CSS pixels (e.g. 1200 for an OG card, 512 for an icon tile). Range: 16-4096.',
      },
      height: {
        type: 'number',
        description: 'Viewport height in CSS pixels. Range: 16-4096.',
      },
      scale: {
        type: 'number',
        description:
          'Device scale factor, 1-3. Output pixels = css × scale. Use 2 for crisp icon masters (e.g. a 512×512 document captured at 1024×1024).',
      },
      transparentBackground: {
        type: 'boolean',
        description:
          'Capture with true alpha: leave the document background transparent (no background on html/body) and the PNG keeps it. No background-removal model involved.',
      },
      savePath: {
        type: 'string',
        description:
          "Optional project-relative path to also save the PNG into the app (e.g. 'dist/interfaces/web/public/og-image.png' so the deployed site self-hosts it).",
      },
    },
    required: ['html', 'width', 'height'],
  },
};

export async function execute(
  input: Record<string, any>,
  onLog?: (line: string) => void,
  context?: ToolExecutionContext,
): Promise<string> {
  const html = typeof input.html === 'string' ? input.html : '';
  const width = Math.round(Number(input.width));
  const height = Math.round(Number(input.height));
  if (
    !html ||
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width < MIN_DIMENSION ||
    width > MAX_DIMENSION ||
    height < MIN_DIMENSION ||
    height > MAX_DIMENSION
  ) {
    return `Error: renderImage requires an html string plus width/height between ${MIN_DIMENSION} and ${MAX_DIMENSION}.`;
  }

  // Serialize with screenshots and browser automation — the render runs in its
  // own tab, but it shares the single software-rasterizing Chrome.
  const release = await acquireBrowserLock();
  let rendered: { url: string; width: number; height: number };
  try {
    onLog?.('Rendering document in the sandbox browser...');
    rendered = await renderHtmlViaSidecar({
      html,
      width,
      height,
      transparent: input.transparentBackground === true,
      scale: typeof input.scale === 'number' ? input.scale : undefined,
    });
  } catch (err: any) {
    return `Error: render failed: ${err?.message ?? err}`;
  } finally {
    release();
  }

  // The capture lands in dev-session scratch storage. Deliverables (app icons,
  // OG images) must outlive the session, so download the bytes and re-host
  // durably via the platform CLI; optionally persist a copy into the project.
  let bytes: Buffer;
  try {
    const res = await fetch(rendered.url);
    if (!res.ok) {
      throw new Error(`fetch returned ${res.status}`);
    }
    bytes = Buffer.from(await res.arrayBuffer());
  } catch (err: any) {
    return `Error: rendered but could not download the capture (${err?.message ?? err}). Temporary URL: ${rendered.url}`;
  }

  let savedPath: string | undefined;
  if (typeof input.savePath === 'string' && input.savePath) {
    const absolute = resolve(PROJECT_ROOT, input.savePath);
    if (!absolute.startsWith(PROJECT_ROOT + sep)) {
      return 'Error: savePath must resolve inside the project.';
    }
    await mkdir(dirname(absolute), { recursive: true });
    await writeFile(absolute, bytes);
    savedPath = input.savePath;
  }

  onLog?.('Hosting the capture...');
  const tmpPath = join(tmpdir(), `render-${randomUUID()}.png`);
  let url = rendered.url;
  let temporary = true;
  try {
    await writeFile(tmpPath, bytes);
    const upload = await runMindstudioCliResult(['upload', tmpPath], {
      timeout: 60_000,
      onLog,
      caller: 'designExpert',
    });
    const match = upload.ok ? upload.value.match(/https:\/\/\S+/g) : null;
    if (match?.length) {
      url = match[match.length - 1];
      temporary = false;
    }
  } finally {
    await unlink(tmpPath).catch(() => {});
  }

  // Same degrade-don't-fail contract as generateImages: a failed review
  // shouldn't discard a render that captured fine.
  const analysis = await analyzeImage({
    prompt: RENDER_ANALYZE_PROMPT,
    image: url,
    onLog,
    model: resolveModel('imageAnalysis', context?.models, context?.model),
  })
    .then((r) => r.analysis)
    .catch((err: any) => `Could not review this image: ${err.message}`);

  return JSON.stringify({
    images: [
      {
        url,
        ...(temporary
          ? {
              note: 'Durable hosting failed — this URL is dev-session scratch storage and may expire. Do not use it for app metadata; retry if a durable URL is needed.',
            }
          : {}),
        ...(savedPath ? { savedPath } : {}),
        analysis,
        width: rendered.width,
        height: rendered.height,
      },
    ],
  });
}
