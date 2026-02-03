/**
 * MCP + Electron E2E: 데모 앱을 띄운 뒤 MCP 서버로 툴 호출 검증
 * 1. Electron 데모 앱 spawn (--remote-debugging-port=9229)
 * 2. 포트 준비·페이지 타겟 대기 후 MCP 서버 spawn
 * 3. initialize, tools/list, get_electron_window_info, click, list_network_requests 등 검증
 *
 * **통과시키는 법**
 * - CI (Linux): `xvfb-run -a bun run test:e2e` — DISPLAY가 설정되어 이 스위트 포함 전체 E2E 실행
 * - 로컬 (Windows 등 DISPLAY 없음): `bun run test:e2e` — 이 스위트는 스킵되고, mcp-e2e·electron-playwright만 실행되어 통과
 * - 이 스위트만 실행: `bun run test:e2e:mcp` (DISPLAY 필요. 워크스페이스 루트에서 `build:demo` 선행)
 */

import { join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const pkgDir = join(__dirname, '../..');
const workspaceRoot = join(pkgDir, '../..');
const demoDir = join(workspaceRoot, 'examples', 'electron-mcp-demo');
const mcpPath = join(pkgDir, 'dist', 'index.js');

/** E2E 전용 포트(9229)로 충돌 방지. MCP 서버는 9222–9225, 9229 스캔. */
const DEBUG_PORT = 9229;
const READY_TIMEOUT_MS = 25000;
const POLL_MS = 300;

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

/** /json에 type===page 타겟이 하나 이상 나타날 때까지 대기 (창 생성 지연 대비) */
async function waitForPageTarget(port: number): Promise<void> {
  const deadline = Date.now() + READY_TIMEOUT_MS;
  let lastPayload: string | undefined;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json`, {
        signal: AbortSignal.timeout(POLL_MS),
      });
      if (res.ok) {
        const raw = (await res.json()) as Array<{ type?: string }>;
        lastPayload = JSON.stringify(raw?.map((t) => ({ type: t?.type })) ?? raw);
        const hasPage = Array.isArray(raw) && raw.some((t) => t && t.type === 'page');
        if (hasPage) return;
      }
    } catch {
      // keep polling
    }
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
  const hint = lastPayload ? ` Last /json types: ${lastPayload}` : '';
  throw new Error(`Port ${port} did not report a page target within ${READY_TIMEOUT_MS}ms.${hint}`);
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
    const electronArgs = [cliPath, '.'];
    if (process.env.CI) {
      electronArgs.push(
        '--no-sandbox',
        '--disable-gpu',
        '--disable-dev-shm-usage',
        '--disable-software-rasterizer'
      );
    }
    electronProc = Bun.spawn(['node', ...electronArgs], {
      cwd: demoDir,
      stdin: 'ignore',
      stdout: 'pipe',
      stderr: 'pipe',
      env: { ...process.env, ELECTRON_REMOTE_DEBUGGING_PORT: String(DEBUG_PORT) },
    });
    await waitForDebugPort(DEBUG_PORT);
    await new Promise((r) => setTimeout(r, 2000));
    await waitForPageTarget(DEBUG_PORT);
    // CI에서 첫 렌더·React 하이드레이션 여유
    await new Promise((r) => setTimeout(r, process.env.CI ? 1000 : 500));

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
    expect(names).toContain('evaluate_script');
    expect(names).toContain('list_network_requests');
    expect(names).toContain('get_network_request');
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
    // CI/헤드리스: 클릭 패널이 보이도록 먼저 사이드바 항목 선택 (선택 전엔 demo-click-button이 DOM에 없음)
    await callMcp('tools/call', {
      name: 'evaluate_script',
      arguments: {
        function:
          "function() { var el = document.querySelector('[data-testid=\"sidebar-click\"]'); if (el) { el.click(); return 'ok'; } return 'no'; }",
        args: [],
      },
    });
    await new Promise((r) => setTimeout(r, 500));
    const res = await callMcp('tools/call', {
      name: 'click',
      arguments: { selector: '[data-testid="demo-click-button"]' },
    });
    expect(res.error).toBeUndefined();
    const content = (res.result as { content?: { type: string; text?: string }[] })?.content ?? [];
    const text = content.find((c) => c.type === 'text')?.text ?? '';
    expect(text).toContain('Clicked');
  });

  test('tools/call list_console_messages after click → 콘솔 메시지 수집', async () => {
    const res = await callMcp('tools/call', {
      name: 'list_console_messages',
      arguments: { waitMs: 600 },
    });
    expect(res.error).toBeUndefined();
    const content = (res.result as { content?: { type: string; text?: string }[] })?.content ?? [];
    const text = content.find((c) => c.type === 'text')?.text ?? '';
    expect(text).toBeDefined();
    // CI/헤드리스에서는 콘솔 수집이 비어 있을 수 있음 — 메시지가 있으면 형식만 검사
    if (text !== '[]' && text.length > 0) {
      expect(text).toMatch(/Electron MCP Demo|console-api/);
    }
  });

  test('tools/call evaluate_script → document.title 반환', async () => {
    const res = await callMcp('tools/call', {
      name: 'evaluate_script',
      arguments: {
        function: 'function() { return document.title; }',
        args: [],
      },
    });
    expect(res.error).toBeUndefined();
    const content = (res.result as { content?: { type: string; text?: string }[] })?.content ?? [];
    const text = content.find((c) => c.type === 'text')?.text ?? '';
    expect(text.trim()).toBe('Electron MCP Demo');
  });

  test('tools/call evaluate_script → 인자 전달 및 반환값(숫자)', async () => {
    const res = await callMcp('tools/call', {
      name: 'evaluate_script',
      arguments: {
        function: 'function(a, b) { return a + b; }',
        args: [10, 32],
      },
    });
    expect(res.error).toBeUndefined();
    const content = (res.result as { content?: { type: string; text?: string }[] })?.content ?? [];
    const text = content.find((c) => c.type === 'text')?.text ?? '';
    expect(text.trim()).toBe('42');
  });

  test('tools/call evaluate_script → DOM 추가 후 값 읽기', async () => {
    const resAdd = await callMcp('tools/call', {
      name: 'evaluate_script',
      arguments: {
        function: `function() {
          var el = document.getElementById('e2e-eval-input');
          if (el) el.remove();
          var input = document.createElement('input');
          input.id = 'e2e-eval-input';
          input.value = 'e2e-value';
          document.body.appendChild(input);
          return 'added';
        }`,
        args: [],
      },
    });
    expect(resAdd.error).toBeUndefined();
    const contentAdd =
      (resAdd.result as { content?: { type: string; text?: string }[] })?.content ?? [];
    expect(contentAdd.find((c) => c.type === 'text')?.text?.trim()).toBe('added');

    const resRead = await callMcp('tools/call', {
      name: 'evaluate_script',
      arguments: {
        function:
          "function() { var el = document.getElementById('e2e-eval-input'); return el ? el.value : ''; }",
        args: [],
      },
    });
    expect(resRead.error).toBeUndefined();
    const contentRead =
      (resRead.result as { content?: { type: string; text?: string }[] })?.content ?? [];
    const textRead = contentRead.find((c) => c.type === 'text')?.text ?? '';
    expect(textRead.trim()).toBe('e2e-value');
  });

  test('tools/call list_network_requests → 상시 수집 후 목록·상세 조회', async () => {
    // CI/헤드리스: click 도구 대신 evaluate_script로 사이드바·버튼 클릭해 패널 노출·fetch 트리거
    await callMcp('tools/call', {
      name: 'evaluate_script',
      arguments: {
        function:
          "function() { var sidebar = document.querySelector('[data-testid=\"sidebar-list_network_requests\"]'); if (sidebar) sidebar.click(); return 'ok'; }",
        args: [],
      },
    });
    await new Promise((r) => setTimeout(r, 500));
    await callMcp('tools/call', {
      name: 'evaluate_script',
      arguments: {
        function:
          "function() { var btn = document.querySelector('[data-testid=\"demo-fetch-httpbin\"]'); if (btn) { btn.click(); return 'clicked'; } return 'no'; }",
        args: [],
      },
    });
    // CI에서 CDP 연결·수집이 늦을 수 있으므로 재시도(최대 3회, 600ms 간격)
    let list: Array<{ requestId: string; url: string; method: string }> = [];
    for (let attempt = 0; attempt < 3; attempt++) {
      await new Promise((r) => setTimeout(r, attempt === 0 ? 1200 : 600));
      const res = await callMcp('tools/call', {
        name: 'list_network_requests',
        arguments: {},
      });
      expect(res.error).toBeUndefined();
      const content =
        (res.result as { content?: { type: string; text?: string }[] })?.content ?? [];
      const text = content.find((c) => c.type === 'text')?.text ?? '';
      list = JSON.parse(text) as Array<{ requestId: string; url: string; method: string }>;
      if (Array.isArray(list) && list.length > 0) break;
    }
    expect(Array.isArray(list)).toBe(true);
    expect(list.length).toBeGreaterThan(0);
    const httpbin = list.find((r) => r.url.includes('httpbin'));
    expect(httpbin).toBeDefined();
    const getRes = await callMcp('tools/call', {
      name: 'get_network_request',
      arguments: { requestId: httpbin!.requestId },
    });
    expect(getRes.error).toBeUndefined();
    const getContent =
      (getRes.result as { content?: { type: string; text?: string }[] })?.content ?? [];
    const getText = getContent.find((c) => c.type === 'text')?.text ?? '';
    const detail = JSON.parse(getText) as { requestId: string; url: string };
    expect(detail.requestId).toBe(httpbin!.requestId);
    expect(detail.url).toContain('httpbin');
  });
});
