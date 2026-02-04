#!/usr/bin/env node
/** Dev 전용: VITE_DEV_SERVER_URL 설정 후 Electron 실행 (셸 따옴표 이슈 회피) */
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const require = createRequire(import.meta.url);
const electronCli = path.join(path.dirname(require.resolve('electron/package.json')), 'cli.js');

process.env.VITE_DEV_SERVER_URL = 'http://localhost:5173';

const child = spawn(
  process.execPath,
  [electronCli, '.', '--remote-debugging-port=9222', '--inspect=9222'],
  {
    cwd: root,
    stdio: 'inherit',
    env: process.env,
  }
);

child.on('exit', (code) => process.exit(code ?? 0));
