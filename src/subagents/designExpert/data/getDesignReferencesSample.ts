import fs from 'node:fs';
import path from 'node:path';

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

const base =
  import.meta.dirname ?? path.dirname(new URL(import.meta.url).pathname);

function readJson<T>(filename: string, fallback: T): T {
  try {
    return JSON.parse(fs.readFileSync(path.join(base, filename), 'utf-8'));
  } catch {
    return fallback;
  }
}

const inspirationImages = readJson('sources/inspiration.json', {
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
