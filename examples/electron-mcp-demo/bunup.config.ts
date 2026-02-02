import { defineConfig } from 'bunup';

export default defineConfig({
  name: 'electron-demo',
  entry: ['src/main.ts', 'src/preload.ts'],
  format: ['cjs'],
  target: 'node',
  outDir: 'dist',
  sourceBase: 'src',
  sourcemap: true,
  external: ['electron'],
});
