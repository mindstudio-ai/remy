import { readJsonAsset } from '../../../assets.js';
import { pickByIndices } from './sampleCache.js';

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

export const uiScreens = readJsonAsset(
  { screens: [] as UiScreenEntry[] },
  'subagents/designExpert/data/sources/ui_inspiration_compiled.json',
).screens;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function getUiInspirationSample(indices: number[]): string {
  const screens = pickByIndices(uiScreens, indices);

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
