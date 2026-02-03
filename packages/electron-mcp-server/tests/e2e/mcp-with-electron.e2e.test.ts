/**
 * MCP + Electron E2E: 데모 앱을 띄운 뒤 MCP 서버로 툴 호출 검증
 * 1. Electron 데모 앱 spawn (--remote-debugging-port=9222)
 * 2. 9222 준비 대기 후 MCP 서버 spawn
 * 3. initialize, tools/list, get_electron_window_info, list_console_messages, click, list_console_messages
 * 실행: 워크스페이스 루트에서 build:demo 후 test:e2e:mcp
 * CI에서는 Xvfb(xvfb-run)로 가상 디스플레이를 켜고 실행하면 됨.
 */

import { join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const pkgDir = join(__dirname, '../..');
const workspaceRoot = join(pkgDir, '../..');
const demoDir = join(workspaceRoot, 'examples', 'electron-mcp-demo');
const mcpPath = join(pkgDir, 'dist', 'index.js');

const DEBUG_PORT = 9222;
const READY_TIMEOUT_MS = 20000;
const POLL_MS = 200;

function send(proc: { stdin?: { write: (s: string) => void; flush?: () => void } }, msg: object) {
  proc.stdin?.write(JSON.stringify(msg) + '\n');
  (proc.stdin as { flush?: () => void })?.flush?.();
}

async function readLine(reader: ReadableStreamDefaultReader<Uint8Array>, buf: { current: string }) {
  const decoder = new TextDecoder();
  while (true) {
    const i = buf.current.indexOf('\n');
    if (i !== -1) {
      const line = buf.current.slice(0, i).trim();
      buf.current = buf.current.slice(i + 1);
      return line;
    }
    const { done, value } = await reader.read();
    if (done) throw new Error('stream ended without newline');
    buf.current += decoder.decode(value);
  }
}

async function waitForDebugPort(port: number): Promise<void> {
  const deadline = Date.now() + READY_TIMEOUT_MS;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json`, {
        signal: AbortSignal.timeout(POLL_MS),
      });
      if (res.ok) return;
    } catch {
      // keep polling
    }
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
  throw new Error(`Port ${port} did not become ready within ${READY_TIMEOUT_MS}ms`);
}

/** DISPLAY 없을 때만 스킵 (CI에서 xvfb-run 사용 시 DISPLAY 설정됨) */
const skipMcpElectronE2E = !process.env.DISPLAY;

describe.skipIf(skipMcpElectronE2E)('MCP + Electron E2E', () => {
  let electronProc: ReturnType<typeof Bun.spawn> | undefined;
  let mcpProc: ReturnType<typeof Bun.spawn> | undefined;
  let stdoutReader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  const stdoutBuf = { current: '' };
  let nextId = 1;

  beforeAll(async () => {
    if (skipMcpElectronE2E) return;
    const { existsSync } = await import('fs');
    const cliPath = existsSync(join(demoDir, 'node_modules', 'electron', 'cli.js'))
      ? join(demoDir, 'node_modules', 'electron', 'cli.js')
      : join(workspaceRoot, 'node_modules', 'electron', 'cli.js');
    electronProc = Bun.spawn(['node', cliPath, '.', '--remote-debugging-port=9222'], {
      cwd: demoDir,
      stdin: 'ignore',
      stdout: 'pipe',
      stderr: 'pipe',
    });
    await waitForDebugPort(DEBUG_PORT);
    await new Promise((r) => setTimeout(r, 500));

    mcpProc = Bun.spawn(['node', mcpPath], {
      cwd: pkgDir,
      stdin: 'pipe',
      stdout: 'pipe',
      stderr: 'inherit',
    });
    stdoutReader = mcpProc.stdout!.getReader();
  }, READY_TIMEOUT_MS + 10000);

  afterAll(async () => {
    if (stdoutReader) stdoutReader.releaseLock();
    if (mcpProc) mcpProc.kill();
    if (electronProc) electronProc.kill();
  });

  function callMcp(
    method: string,
    params?: object
  ): Promise<{ id: number; result?: unknown; error?: { message: string } }> {
    if (!mcpProc || !stdoutReader) throw new Error('MCP not started');
    const id = nextId++;
    send(mcpProc, { jsonrpc: '2.0', id, method, params: params ?? {} });
    return readLine(stdoutReader, stdoutBuf).then((line) => {
      const res = JSON.parse(line) as { id: number; result?: unknown; error?: { message: string } };
      return res;
    });
  }

  test('initialize', async () => {
    const res = await callMcp('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'e2e', version: '1.0' },
    });
    expect(res.error).toBeUndefined();
    expect(res.result).toBeDefined();
  });

  test('notifications/initialized then tools/list', async () => {
    if (!mcpProc) throw new Error('MCP not started');
    send(mcpProc, { jsonrpc: '2.0', method: 'notifications/initialized' });
    const res = await callMcp('tools/list');
    expect(res.error).toBeUndefined();
    const tools = (res.result as { tools?: { name: string }[] })?.tools ?? [];
    const names = tools.map((t) => t.name);
    expect(names).toContain('get_electron_window_info');
    expect(names).toContain('list_console_messages');
    expect(names).toContain('get_console_message');
    expect(names).toContain('click');
  });

  test('tools/call get_electron_window_info → automationReady', async () => {
    const res = await callMcp('tools/call', {
      name: 'get_electron_window_info',
      arguments: {},
    });
    expect(res.error).toBeUndefined();
    const content = (res.result as { content?: { type: string; text?: string }[] })?.content ?? [];
    const text = content.find((c) => c.type === 'text')?.text ?? '';
    expect(text).toContain('automationReady');
    expect(text).toMatch(/true/);
  });

  test('tools/call list_console_messages', async () => {
    const res = await callMcp('tools/call', {
      name: 'list_console_messages',
      arguments: { waitMs: 800 },
    });
    expect(res.error).toBeUndefined();
    const content = (res.result as { content?: { type: string; text?: string }[] })?.content ?? [];
    const text = content.find((c) => c.type === 'text')?.text ?? '';
    expect(text).toBeDefined();
  });

  test('tools/call click → 버튼 클릭', async () => {
    const res = await callMcp('tools/call', {
      name: 'click',
      arguments: { selector: '[data-testid="demo-click-button"]' },
    });
    expect(res.error).toBeUndefined();
    const content = (res.result as { content?: { type: string; text?: string }[] })?.content ?? [];
    const text = content.find((c) => c.type === 'text')?.text ?? '';
    expect(text).toContain('Clicked');
  });

  test('tools/call list_console_messages after click → Button clicked 로그', async () => {
    const res = await callMcp('tools/call', {
      name: 'list_console_messages',
      arguments: { waitMs: 600 },
    });
    expect(res.error).toBeUndefined();
    const content = (res.result as { content?: { type: string; text?: string }[] })?.content ?? [];
    const text = content.find((c) => c.type === 'text')?.text ?? '';
    expect(text).toContain('Button clicked');
  });
});
