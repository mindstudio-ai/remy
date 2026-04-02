import { readJsonAsset } from '../../../assets.js';
import { pickByIndices } from './sampleCache.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface InspirationEntry {
  url: string;
  analysis: string;
}

// ---------------------------------------------------------------------------
// Data (loaded once at module init)
// ---------------------------------------------------------------------------

export const inspirationImages = readJsonAsset(
  { images: [] as InspirationEntry[] },
  'subagents/designExpert/data/sources/inspiration.json',
).images;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function getDesignReferencesSample(indices: number[]): string {
  const images = pickByIndices(inspirationImages, indices);

  if (!images.length) {
    return '';
  }

  const imageList = images
    .map((img, i) => `### Reference ${i + 1}\n${img.analysis}`)
    .join('\n\n');

  return `
## Visual Design References

This is your personal reference library of visual design you love. The apps and sites featured within made it into your library because they did something bold, intentional, and memorable. Use them as reference, inspiration, and let the takeaways guide your work.

${imageList}`.trim();
}
