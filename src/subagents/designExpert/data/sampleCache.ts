/**
 * Persistent sample cache for design expert reference data.
 *
 * Generates random index selections on first call, writes them to
 * .remy-design-sample.json in cwd, and reuses them for the rest of
 * the session. Survives sandbox suspend/resume because state is on disk.
 */

import fs from 'node:fs';

const SAMPLE_FILE = '.remy-design-sample.json';

interface SampleIndices {
  uiInspiration: number[];
  designReferences: number[];
  fonts: number[];
}

let cached: SampleIndices | null = null;

/** Fisher-Yates shuffle on indices, return first n. */
function generateIndices(poolSize: number, sampleSize: number): number[] {
  const n = Math.min(sampleSize, poolSize);
  const indices = Array.from({ length: poolSize }, (_, i) => i);
  for (let i = indices.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }
  return indices.slice(0, n);
}

function load(): SampleIndices | null {
  try {
    return JSON.parse(fs.readFileSync(SAMPLE_FILE, 'utf-8'));
  } catch {
    return null;
  }
}

function save(indices: SampleIndices): void {
  try {
    fs.writeFileSync(SAMPLE_FILE, JSON.stringify(indices));
  } catch {
    // Non-fatal — next call will regenerate
  }
}

/**
 * Get or create stable sample indices for all design reference datasets.
 * Pool sizes are the total number of items in each dataset (used to
 * validate cached indices and generate new ones).
 */
export function getSampleIndices(
  pools: {
    uiInspiration: number;
    designReferences: number;
    fonts: number;
  },
  sizes: {
    uiInspiration: number;
    designReferences: number;
    fonts: number;
  },
): SampleIndices {
  if (cached) {
    return cached;
  }

  const loaded = load();
  if (loaded) {
    // Clamp any out-of-bounds indices (pool size may have changed)
    let dirty = false;
    for (const key of ['uiInspiration', 'designReferences', 'fonts'] as const) {
      const before = loaded[key].length;
      loaded[key] = loaded[key].filter((i) => i < pools[key]);
      if (loaded[key].length < before) {
        dirty = true;
      }
    }
    if (dirty) {
      save(loaded);
    }

    cached = loaded;
    return cached;
  }

  // First call — generate fresh indices
  cached = {
    uiInspiration: generateIndices(pools.uiInspiration, sizes.uiInspiration),
    designReferences: generateIndices(
      pools.designReferences,
      sizes.designReferences,
    ),
    fonts: generateIndices(pools.fonts, sizes.fonts),
  };

  save(cached);
  return cached;
}

/** Pick items from an array using pre-computed indices. */
export function pickByIndices<T>(arr: T[], indices: number[]): T[] {
  return indices.filter((i) => i < arr.length).map((i) => arr[i]);
}
