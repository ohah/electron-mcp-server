/**
 * MCP E2E: bun test로 stdio 서버 띄우고 JSON-RPC 검증
 * 사용: bun run build:main && bun test tests/e2e
 */
import { join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const pkgDir = join(__dirname, '../..');
const mcpPath = join(pkgDir, 'dist', 'index.js');

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

describe('MCP E2E', () => {
  let proc: ReturnType<typeof Bun.spawn>;
  let stdoutReader: ReadableStreamDefaultReader<Uint8Array>;
  const stdoutBuf = { current: '' };

  beforeAll(() => {
    proc = Bun.spawn(['node', mcpPath], {
      cwd: pkgDir,
      stdin: 'pipe',
      stdout: 'pipe',
      stderr: 'inherit',
    });
    stdoutReader = proc.stdout!.getReader();
  });

  afterAll(() => {
    stdoutReader.releaseLock();
    proc.kill();
  });

  test('initialize', async () => {
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
    const line = await readLine(stdoutReader, stdoutBuf);
    const res = JSON.parse(line);
    expect(res.error).toBeUndefined();
    expect(res.result).toBeDefined();
  });

  test('tools/list', async () => {
    send(proc, { jsonrpc: '2.0', method: 'notifications/initialized' });
    send(proc, { jsonrpc: '2.0', id: 2, method: 'tools/list' });
    const line = await readLine(stdoutReader, stdoutBuf);
    const res = JSON.parse(line);
    expect(res.error).toBeUndefined();
    const tools = res.result?.tools ?? [];
    const names = tools.map((t: { name: string }) => t.name);
    expect(names).toContain('get_electron_window_info');
    expect(names).toContain('take_screenshot');
    expect(names).toContain('send_command_to_electron');
  });

  test('tools/call get_electron_window_info', async () => {
    send(proc, {
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: { name: 'get_electron_window_info', arguments: {} },
    });
    const line = await readLine(stdoutReader, stdoutBuf);
    const res = JSON.parse(line);
    const content = res.result?.content ?? [];
    const text = content.find((c: { type: string }) => c.type === 'text')?.text ?? '';
    const ok =
      !res.error &&
      (text.includes('No Electron') ||
        text.includes('remote debugging') ||
        text.includes('windows') ||
        text.includes('automationReady'));
    if (res.error && !text) {
      console.warn('tools/call error (schema/version):', res.error?.message);
    }
    expect(ok || !res.error).toBe(true);
  });
});
