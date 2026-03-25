import { readJsonAsset } from '../../../assets.js';

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

const inspirationImages = readJsonAsset(
  { images: [] as InspirationEntry[] },
  'subagents/designExpert/data/sources/inspiration.json',
).images;

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

export function getDesignReferencesSample(): string {
  const images = sample(inspirationImages, 25);

  if (!images.length) {
    return '';
  }

  const imageList = images.map((img) => `- ${img.analysis}`).join('\n\n');

  return `
## Design References

This is what the bar looks like. These are real sites that made it onto curated design galleries because they did something bold, intentional, and memorable. Use them as inspiration and let the takeaways guide your work. Your designs should feel like they belong in this company.

${imageList}`.trim();
}
