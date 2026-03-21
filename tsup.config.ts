import { defineConfig } from 'tsup';
import { cpSync } from 'fs';
import { resolve } from 'path';

/** Copy non-code assets (markdown, JSON) into dist/ preserving directory structure. */
function copyAssets() {
  const pairs = [
    ['src/prompt', 'dist/prompt'],
    ['src/subagents', 'dist/subagents'],
    ['src/actions', 'dist/actions'],
  ];
  for (const [src, dest] of pairs) {
    try {
      cpSync(resolve(src), resolve(dest), {
        recursive: true,
        filter: (path) => {
          // Copy directories, .md, .json, and .sh files
          if (!path.includes('.')) return true;
          return /\.(md|json|sh)$/.test(path);
        },
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
