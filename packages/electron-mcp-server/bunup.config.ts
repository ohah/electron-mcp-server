import { defineConfig } from 'bunup';

export default defineConfig({
  name: 'mcp-server',
  entry: ['src/index.ts'],
  format: ['cjs'],
  target: 'node',
  outDir: 'dist',
  sourcemap: true,
  banner: '#!/usr/bin/env node\n',
  // MCP SDK·ws 모두 번들에 포함해 npx 설치 시 의존성 해석 오류 방지(런타임 의존성 없음)
  external: ['playwright'],
});
