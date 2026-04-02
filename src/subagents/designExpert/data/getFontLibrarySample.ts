import { readJsonAsset } from '../../../assets.js';
import { pickByIndices } from './sampleCache.js';

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

// ---------------------------------------------------------------------------
// Data (loaded once at module init)
// ---------------------------------------------------------------------------

export const fontData = readJsonAsset(
  { cssUrlPattern: '', fonts: [] as Font[] },
  'subagents/designExpert/data/sources/fonts.json',
);

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function getFontLibrarySample(fontIndices: number[]): string {
  const fonts = pickByIndices(fontData.fonts, fontIndices);

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

  return `
## Font Library

This is your personal library of fonts you love. Use it as a starting point when thinking about anything related to typography.

${fontList}`.trim();
}
