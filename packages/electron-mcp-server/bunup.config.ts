import { defineConfig } from 'bunup';

export default defineConfig({
  name: 'mcp-server',
  entry: ['src/index.ts'],
  format: ['cjs'],
  target: 'node',
  outDir: 'dist',
  sourcemap: true,
  banner: '#!/usr/bin/env node\n',
  external: [
    '@modelcontextprotocol/sdk',
    '@modelcontextprotocol/sdk/server/mcp',
    '@modelcontextprotocol/sdk/server/stdio',
    'ws',
    'playwright',
  ],
});
