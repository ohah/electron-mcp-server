import * as esbuild from 'esbuild';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pkgDir = path.join(__dirname, '..');
const srcDir = path.join(pkgDir, 'src');
const outDir = path.join(pkgDir, 'dist');

await Promise.all([
  esbuild.build({
    entryPoints: [path.join(srcDir, 'main.ts')],
    bundle: true,
    platform: 'node',
    format: 'cjs',
    outfile: path.join(outDir, 'main.js'),
    external: [
      'electron',
      '@modelcontextprotocol/sdk/server/mcp',
      '@modelcontextprotocol/sdk/server/stdio',
    ],
    sourcemap: true,
    minify: false,
  }),
  esbuild.build({
    entryPoints: [path.join(srcDir, 'preload.ts')],
    bundle: true,
    platform: 'node',
    format: 'cjs',
    outfile: path.join(outDir, 'preload.js'),
    external: [
      'electron',
      '@modelcontextprotocol/sdk/server/mcp',
      '@modelcontextprotocol/sdk/server/stdio',
    ],
    sourcemap: true,
    minify: false,
  }),
  esbuild.build({
    entryPoints: [path.join(srcDir, 'index.ts')],
    bundle: true,
    platform: 'node',
    format: 'cjs',
    outfile: path.join(outDir, 'mcp-server.js'),
    banner: { js: '#!/usr/bin/env node\n' },
    external: [
      '@modelcontextprotocol/sdk',
      '@modelcontextprotocol/sdk/server/mcp',
      '@modelcontextprotocol/sdk/server/stdio',
      'ws',
      'playwright',
    ],
    sourcemap: true,
    minify: false,
  }),
]);

console.error('build:main (esbuild) done');
