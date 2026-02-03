/**
 * MCP E2E: stdio로 서버를 띄우고 JSON-RPC로 initialize → tools/list → tools/call 검증
 * 사용: node tests/e2e/mcp-e2e.mjs (패키지 루트에서, build 후)
 */
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pkgDir = path.resolve(__dirname, '../..');
const mcpPath = path.join(pkgDir, 'dist', 'index.js');

function send(proc, msg) {
  proc.stdin.write(JSON.stringify(msg) + '\n');
}

function readLine(proc) {
  return new Promise((resolve, reject) => {
    let buf = '';
    const onData = (chunk) => {
      buf += chunk.toString();
      const i = buf.indexOf('\n');
      if (i !== -1) {
        proc.stdout.removeListener('data', onData);
        resolve(buf.slice(0, i).trim());
      }
    };
    proc.stdout.on('data', onData);
    setTimeout(() => {
      proc.stdout.removeListener('data', onData);
      reject(new Error('timeout waiting for line'));
    }, 10000);
  });
}

async function main() {
  const proc = spawn(process.execPath, [mcpPath], {
    cwd: pkgDir,
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  proc.stderr.on('data', (d) => process.stderr.write(d));

  const out = [];
  proc.stdout.on('data', (d) => out.push(d.toString()));

  // Initialize
  send(proc, {
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'e2e', version: '1.0' },
    },
  });

  let line = await readLine(proc);
  const initRes = JSON.parse(line);
  if (initRes.error) {
    console.error('initialize error:', initRes.error);
    process.exit(1);
  }
  console.log('✓ initialize OK');

  // Notifications/initialized
  send(proc, { jsonrpc: '2.0', method: 'notifications/initialized' });

  // tools/list
  send(proc, { jsonrpc: '2.0', id: 2, method: 'tools/list' });
  line = await readLine(proc);
  const listRes = JSON.parse(line);
  if (listRes.error) {
    console.error('tools/list error:', listRes.error);
    process.exit(1);
  }
  const tools = listRes.result?.tools ?? [];
  const names = tools.map((t) => t.name);
  const required = ['get_electron_window_info', 'take_snapshot', 'send_command_to_electron'];
  for (const r of required) {
    if (!names.includes(r)) {
      console.error('missing tool:', r, 'got:', names);
      process.exit(1);
    }
  }
  console.log('✓ tools/list OK:', names.join(', '));

  // tools/call get_electron_window_info (Electron 없어도 "no app" 메시지 또는 에러 반환)
  send(proc, {
    jsonrpc: '2.0',
    id: 3,
    method: 'tools/call',
    params: { name: 'get_electron_window_info', arguments: {} },
  });
  line = await readLine(proc);
  const callRes = JSON.parse(line);
  const content = callRes.result?.content ?? [];
  const text = content.find((c) => c.type === 'text')?.text ?? '';
  const isOk =
    !callRes.error &&
    (text.includes('No Electron') ||
      text.includes('remote debugging') ||
      text.includes('windows') ||
      text.includes('automationReady'));
  if (callRes.error && !text) {
    console.warn(
      'tools/call returned error (server schema/version):',
      callRes.error?.message ?? callRes.error
    );
  }
  if (!isOk && callRes.error) {
    console.error('tools/call error:', callRes.error);
    process.exit(1);
  }
  if (!isOk) {
    console.error('unexpected get_electron_window_info response:', text.slice(0, 300));
    process.exit(1);
  }
  console.log('✓ tools/call get_electron_window_info OK');

  proc.kill('SIGTERM');
  console.log('MCP E2E passed.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
