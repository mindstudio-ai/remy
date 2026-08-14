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
 * The base directory for resolving asset paths: the directory this module
 * itself lives in. That's `src/` when running from source and `dist/` when
 * running the bundle — tsup emits both entries at the root of dist/ with
 * `splitting: false`, so the bundle's own location is the asset root.
 *
 * Derived from the module rather than by probing for a `dist/` directory,
 * because probing gets dev wrong: once a build existed, `dist/` won even for a
 * process started from source, so editing a prompt .md had no visible effect.
 */
const ASSETS_BASE =
  import.meta.dirname ?? path.dirname(new URL(import.meta.url).pathname);

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
