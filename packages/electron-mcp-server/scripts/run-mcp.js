/**
 * MCP 전용 런처: Node 전용 MCP 서버를 실행합니다 (Electron 프로세스 아님).
 * Cursor가 워크스페이스 루트를 cwd로 두고 spawn해도, 패키지 디렉터리를 cwd로 해서
 * node dist/index.cjs를 실행해 node_modules를 찾을 수 있게 합니다.
 */
const path = require('path');
const { spawn } = require('child_process');

const pkgDir = path.resolve(path.join(__dirname, '..'));
const mcpScript = path.join(pkgDir, 'dist', 'index.cjs');

const child = spawn(process.execPath, [mcpScript], {
  cwd: pkgDir,
  stdio: 'inherit',
  shell: false,
});

child.on('exit', (code) => process.exit(code ?? 0));
