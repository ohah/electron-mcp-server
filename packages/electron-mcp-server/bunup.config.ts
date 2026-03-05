import { defineConfig } from 'bunup';

export default defineConfig({
  name: 'mcp-server',
  entry: ['src/index.ts'],
  format: ['cjs'],
  target: 'node',
  outDir: 'dist',
  sourcemap: true,
  banner: '#!/usr/bin/env node\n',
  // MCP SDK·ws 번들 포함. zod는 번들 시 내부 참조(util3)가 깨져 CI 실패하므로 external로 런타임 로드
  external: ['playwright', 'zod'],
});
