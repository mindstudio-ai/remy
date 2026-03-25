import fs from 'node:fs';
import path from 'node:path';

// ---------------------------------------------------------------------------
// Types
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
  description?: string;
}

interface Pairing {
  heading: { font: string; slug: string; weight: number };
  body: { font: string; slug: string; weight: number };
}

// ---------------------------------------------------------------------------
// Data (loaded once at module init)
// ---------------------------------------------------------------------------

const base =
  import.meta.dirname ?? path.dirname(new URL(import.meta.url).pathname);

function readJson<T>(filename: string, fallback: T): T {
  try {
    return JSON.parse(fs.readFileSync(path.join(base, filename), 'utf-8'));
  } catch {
    return fallback;
  }
}

const fontData = readJson('sources/fonts.json', {
  cssUrlPattern: '',
  fonts: [] as Font[],
  pairings: [] as Pairing[],
});

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

export function getFontLibrarySample(): string {
  const fonts = sample(fontData.fonts, 30);
  const pairings = sample(fontData.pairings, 20);

  if (!fonts.length) {
    return '';
  }

  const fontList = fonts
    .map((f) => {
      let cssInfo = '';
      if (f.source === 'fontshare') {
        cssInfo = ` CSS: ${fontData.cssUrlPattern.replace('{slug}', f.slug).replace('{weights}', f.weights.join(','))}`;
      } else if (f.cssUrl) {
        cssInfo = ` CSS: ${f.cssUrl}`;
      } else if (f.source === 'open-foundry') {
        cssInfo = ' (self-host required)';
      }
      const desc = f.description ? ` ${f.description}` : '';
      return `- **${f.name}** — ${f.category}. Weights: ${f.weights.join(', ')}.${f.variable ? ' Variable.' : ''}${f.italics ? ' Has italics.' : ''}${cssInfo}${desc}`;
    })
    .join('\n');

  const pairingList = pairings
    .map(
      (p) =>
        `- **${p.heading.font}** (${p.heading.weight}) heading + **${p.body.font}** (${p.body.weight}) body`,
    )
    .join('\n');

  return `
## Font Library

A random sample from a curated font library. Use these as starting points for font selection.
CSS URL pattern: ${fontData.cssUrlPattern}

### Fonts

${fontList}

### Pairings

${pairingList}`.trim();
}
