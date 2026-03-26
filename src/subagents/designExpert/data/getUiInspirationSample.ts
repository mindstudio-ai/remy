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
  const screens = sample(uiScreens, 25);

  if (!screens.length) {
    return '';
  }

  const screenList = screens
    .map((s, i) => `### Screen ${i + 1}\n${s.analysis}`)
    .join('\n\n');

  return `
## UI Case Studies

These are your personal notes, collected over the years, about UI patterns you've encountered in the wild that you love. You re-use aspects of them liberally in your work, reference them as ground truths, as well as use them to synthesize new ideas and refine your sense of what good UI feels and looks like. The work you do must always feel like it belongs in this company.

${screenList}`.trim();
}
