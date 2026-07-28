import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['cjs'],
  platform: 'node',
  outDir: 'dist',
  sourcemap: true,
  banner: '#!/usr/bin/env node\n',
  deps: {
    neverBundle: ['playwright', 'zod'],
  },
});
