import { readJsonAsset } from '../../../assets.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface UiScreenEntry {
  url: string;
  analysis: string;
}

// ---------------------------------------------------------------------------
// Data (loaded once at module init)
// ---------------------------------------------------------------------------

const uiScreens = readJsonAsset(
  { screens: [] as UiScreenEntry[] },
  'subagents/designExpert/data/sources/ui_inspiration_compiled.json',
).screens;

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

export function getUiInspirationSample(): string {
  const screens = sample(uiScreens, 20);

  if (!screens.length) {
    return '';
  }

  const screenList = screens
    .map((s, i) => `### Screen ${i + 1}\n${s.analysis}`)
    .join('\n\n');

  return `
## UI Pattern References

There are real app screens from well-designed products, sourced and curated by hand as a reference by a desigher. Use them as inspiration and let the takeaways guide your work. Your designs should feel like they belong in this company.

${screenList}`.trim();
}
