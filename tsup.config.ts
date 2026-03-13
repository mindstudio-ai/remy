import { defineConfig } from 'tsup';

export default defineConfig([
  {
    entry: ['src/index.tsx'],
    format: ['esm'],
    clean: true,
    splitting: false,
    sourcemap: false,
    banner: { js: '#!/usr/bin/env node' },
  },
  {
    entry: ['src/headless.ts'],
    format: ['esm'],
    splitting: false,
    sourcemap: false,
    dts: true,
  },
]);
