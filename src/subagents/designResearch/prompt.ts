/**
 * System prompt for the design research sub-agent.
 *
 * Assembles the prompt from markdown templates (prompts/) and injects
 * fresh random samples of fonts and inspiration images on each call.
 */

import fs from 'node:fs';
import path from 'node:path';

// ---------------------------------------------------------------------------
// File loading
// ---------------------------------------------------------------------------

const base =
  import.meta.dirname ?? path.dirname(new URL(import.meta.url).pathname);

// Resolve paths relative to this directory, with fallback for bundled layout.
// Paths starting with @src/ resolve relative to the src/ root (for sharing
// files with the main prompt system).
function resolvePath(filename: string): string {
  if (filename.startsWith('@src/')) {
    const srcRelative = filename.slice(5);
    const srcLocal = path.join(base, '..', '..', srcRelative);
    if (fs.existsSync(srcLocal)) {
      return srcLocal;
    }
    // Bundled: base is dist/
    return path.join(base, srcRelative);
  }
  const local = path.join(base, filename);
  return fs.existsSync(local)
    ? local
    : path.join(base, 'subagents', 'designResearch', filename);
}

function readFile(filename: string): string {
  return fs.readFileSync(resolvePath(filename), 'utf-8').trim();
}

function readJson<T>(filename: string, fallback: T): T {
  try {
    return JSON.parse(fs.readFileSync(resolvePath(filename), 'utf-8'));
  } catch {
    return fallback;
  }
}

// ---------------------------------------------------------------------------
// Template assembly (runs once at module init)
// ---------------------------------------------------------------------------

const RUNTIME_PLACEHOLDERS = new Set([
  'fonts_to_consider',
  'inspiration_images',
]);

const PROMPT_TEMPLATE = readFile('prompt.md')
  .replace(/\{\{([^}]+)\}\}/g, (match, key) => {
    const k = key.trim();
    return RUNTIME_PLACEHOLDERS.has(k) ? match : readFile(k);
  })
  .replace(/\n{3,}/g, '\n\n');

// ---------------------------------------------------------------------------
// Data (loaded once at module init)
// ---------------------------------------------------------------------------

interface Font {
  name: string;
  slug: string;
  category: string;
  variable: boolean;
  weights: number[];
  italics: boolean;
  tags: string[];
}

interface Pairing {
  heading: { font: string; slug: string; weight: number };
  body: { font: string; slug: string; weight: number };
}

const fontData = readJson('data/fonts.json', {
  cssUrlPattern: '',
  fonts: [] as Font[],
  pairings: [] as Pairing[],
});

interface InspirationEntry {
  url: string;
  analysis: string;
}

const inspirationImages = readJson('data/inspiration.json', {
  images: [] as InspirationEntry[],
}).images;

// ---------------------------------------------------------------------------
// Sampling
// ---------------------------------------------------------------------------

/** Pick n random items from an array (Fisher-Yates). */
function sample<T>(arr: T[], n: number): T[] {
  if (arr.length <= n) {
    return [...arr];
  }
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, n);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Build the design research prompt with fresh random samples.
 * Call per invocation, not once at init.
 */
export function getDesignResearchPrompt(): string {
  const fonts = sample(fontData.fonts, 15);
  const pairings = sample(fontData.pairings, 5);
  const images = sample(inspirationImages, 5);

  const fontList = fonts
    .map((f) => {
      const tags = f.tags.length ? ` (${f.tags.join(', ')})` : '';
      return `- **${f.name}** (${f.slug}) — ${f.category}${tags}. Weights: ${f.weights.join(', ')}.${f.variable ? ' Variable.' : ''}${f.italics ? ' Has italics.' : ''}`;
    })
    .join('\n');

  const pairingList = pairings
    .map(
      (p) =>
        `- **${p.heading.font}** (${p.heading.weight}) heading + **${p.body.font}** (${p.body.weight}) body`,
    )
    .join('\n');

  const fontsSection = fonts.length
    ? `<fonts_to_consider>
## Fonts to consider

A random sample from the Fontshare catalog. Use these as starting points for font selection.
CSS URL pattern: ${fontData.cssUrlPattern}

${fontList}

### Suggested pairings

${pairingList}
</fonts_to_consider>`
    : '';

  const imageList = images
    .map((img) => `- **${img.url}**\n  ${img.analysis}`)
    .join('\n\n');

  const inspirationSection = images.length
    ? `<inspiration_images>
## Design inspiration

A random sample of curated design references with pre-analyzed descriptions. Use these to inform your recommendations. You can also use \`analyzeDesignReference\` on any URL for a deeper look.

${imageList}
</inspiration_images>`
    : '';

  return PROMPT_TEMPLATE.replace('{{fonts_to_consider}}', fontsSection).replace(
    '{{inspiration_images}}',
    inspirationSection,
  );
}
