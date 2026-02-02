import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

const packageDir = __dirname;
const rendererDir = path.join(packageDir, 'src', 'renderer');

export default defineConfig({
  root: rendererDir,
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
    hmr: { host: 'localhost', port: 5173, protocol: 'ws' },
  },
  build: {
    outDir: path.join(packageDir, 'dist/renderer'),
    emptyOutDir: true,
  },
  base: './',
  resolve: {
    alias: {
      '@': path.join(rendererDir, 'src'),
    },
  },
});
