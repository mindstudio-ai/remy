import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.tsx'],
  format: ['esm'],
  clean: true,
  splitting: false,
  sourcemap: false,
  banner: { js: '#!/usr/bin/env node' },
});
