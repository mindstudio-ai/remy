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

function resolvePath(filename: string): string {
  const local = path.join(base, filename);
  return fs.existsSync(local)
    ? local
    : path.join(base, 'subagents', 'designExpert', filename);
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
  source: 'fontshare' | 'google-fonts' | 'open-foundry';
  googleFontsFamily?: string;
  cssUrl?: string;
  variable?: boolean;
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
  const fonts = sample(fontData.fonts, 30);
  const pairings = sample(fontData.pairings, 20);
  const images = sample(inspirationImages, 40);

  const fontList = fonts
    .map((f) => {
      const tags = f.tags.length ? ` (${f.tags.join(', ')})` : '';
      let cssInfo = '';
      if (f.source === 'fontshare') {
        cssInfo = ` CSS: ${fontData.cssUrlPattern.replace('{slug}', f.slug).replace('{weights}', f.weights.join(','))}`;
      } else if (f.cssUrl) {
        cssInfo = ` CSS: ${f.cssUrl}`;
      } else if (f.source === 'open-foundry') {
        cssInfo = ' (self-host required)';
      }
      return `- **${f.name}** — ${f.category}${tags}. Weights: ${f.weights.join(', ')}.${f.variable ? ' Variable.' : ''}${f.italics ? ' Has italics.' : ''}${cssInfo}`;
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

A random sample from Fontshare, Open Foundry, and Google Fonts. Use these as starting points for font selection.
CSS URL pattern: ${fontData.cssUrlPattern}

${fontList}

### Suggested pairings

${pairingList}
</fonts_to_consider>`
    : '';

  const imageList = images.map((img) => `- ${img.analysis}`).join('\n\n');

  const inspirationSection = images.length
    ? `<inspiration_images>
## Design inspiration

A random sample of pre-analyzed design references. Use these observations to inform your recommendations.

${imageList}
</inspiration_images>`
    : '';

  return PROMPT_TEMPLATE.replace('{{fonts_to_consider}}', fontsSection).replace(
    '{{inspiration_images}}',
    inspirationSection,
  );
}
