/**
 * Asset resolution helpers.
 *
 * All non-code assets (markdown, JSON, etc.) are copied into dist/
 * preserving the src/ directory structure. These helpers resolve asset
 * paths relative to the project root regardless of whether the code
 * is running from src/ (dev) or dist/ (bundled).
 */

import fs from 'node:fs';
import path from 'node:path';

/**
 * Project root directory — the parent of src/ or dist/.
 *
 * Works whether running from source (src/) or bundled output (dist/)
 * by walking up from the current file's location until we find
 * package.json.
 */
const ROOT = findRoot(
  import.meta.dirname ?? path.dirname(new URL(import.meta.url).pathname),
);

function findRoot(start: string): string {
  let dir = start;
  while (dir !== path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, 'package.json'))) {
      return dir;
    }
    dir = path.dirname(dir);
  }
  return start;
}

/**
 * The base directory for resolving asset paths — either src/ or dist/
 * depending on the runtime environment.
 */
const ASSETS_BASE = fs.existsSync(path.join(ROOT, 'dist', 'prompt'))
  ? path.join(ROOT, 'dist')
  : path.join(ROOT, 'src');

/**
 * Resolve an asset path relative to the assets base directory.
 *
 * @example
 *   assetPath('prompt/static/identity.md')
 *   assetPath('subagents/designExpert/prompt.md')
 *   assetPath('actions/sync.md')
 */
export function assetPath(...segments: string[]): string {
  return path.join(ASSETS_BASE, ...segments);
}

/** Read a text asset file, returning its trimmed contents. Throws if missing. */
export function readAsset(...segments: string[]): string {
  const full = assetPath(...segments);
  try {
    return fs.readFileSync(full, 'utf-8').trim();
  } catch {
    throw new Error(`Required asset missing: ${full}`);
  }
}

/** Read a JSON asset file, returning the parsed value or a fallback on error. */
export function readJsonAsset<T>(fallback: T, ...segments: string[]): T {
  const full = assetPath(...segments);
  try {
    return JSON.parse(fs.readFileSync(full, 'utf-8'));
  } catch {
    return fallback;
  }
}
