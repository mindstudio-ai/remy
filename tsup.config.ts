import { defineConfig } from 'tsup';
import { cpSync } from 'fs';
import { resolve } from 'path';

const ASSET_PATTERN = /\.(md|json|sh|txt|mjs|html)$/;
const assetFilter = (p: string) => !p.includes('.') || ASSET_PATTERN.test(p);

/** Copy non-code assets into dist/ preserving directory structure from src/. */
function copyAssets() {
  const pairs: Array<[string, string]> = [
    ['src/prompt', 'dist/prompt'],
    ['src/subagents', 'dist/subagents'],
  ];
  for (const [src, dest] of pairs) {
    try {
      cpSync(resolve(src), resolve(dest), {
        recursive: true,
        filter: assetFilter,
      });
    } catch {
      // Directory may not exist
    }
  }
}

export default defineConfig([
  {
    entry: ['src/index.tsx'],
    format: ['esm'],
    clean: true,
    splitting: false,
    sourcemap: false,
    banner: { js: '#!/usr/bin/env node' },
    onSuccess: () => {
      copyAssets();
      console.log('Copied static assets to dist/');
    },
  },
  {
    entry: ['src/headless.ts'],
    format: ['esm'],
    splitting: false,
    sourcemap: false,
    dts: true,
  },
]);
