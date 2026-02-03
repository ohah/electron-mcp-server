/**
 * Bun 워크스페이스에서 루트 node_modules/.bin 에 electron-mcp-server 링크가
 * 생성되지 않는 경우를 보완합니다. postinstall에서 호출됩니다.
 * npx -y @ohah/electron-mcp-server 실행 시 bin을 찾을 수 있게 합니다.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const target = path.join(root, 'node_modules', '@ohah', 'electron-mcp-server', 'dist', 'index.js');
const binDir = path.join(root, 'node_modules', '.bin');
const linkPath = path.join(binDir, 'electron-mcp-server');

if (!fs.existsSync(target)) {
  // dist 미빌드 시 스킵 (빌드 후 재설치 시 링크 생성됨)
  process.exit(0);
}

// sh가 bin을 실행할 때 Permission denied 방지 (shebang은 bunup banner로 이미 있음)
fs.chmodSync(target, 0o755);

if (!fs.existsSync(binDir)) {
  fs.mkdirSync(binDir, { recursive: true });
}

const relativeTarget = path.relative(path.dirname(linkPath), target);
try {
  fs.symlinkSync(relativeTarget, linkPath);
} catch (e) {
  if (e.code !== 'EEXIST') throw e;
}
