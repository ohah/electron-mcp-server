/**
 * Electron/CDP 공통: 앱 발견, 타겟 조회, JS 실행, CDP 명령.
 * 여러 툴에서 공유하므로 tools/electron/ 으로 두고 index 로 노출.
 * Ports 9229, 9230 우선 스캔 후 9222–9225.
 */

import WebSocket from 'ws';

/** 프로세스 전역 CDP 요청 id. 멀티 윈도우·동시 호출 시에도 응답 매칭 충돌 방지. */
let nextCdpId = 1;

const CDP_REQUEST_TIMEOUT_MS = 30_000;

/** CDP WebSocket 연결을 열고, 콜백 실행 후 연결 종료. 여러 툴에서 공통 사용. */
export function withCdpWs<T>(
  target: DevToolsTarget,
  fn: (ws: WebSocket) => Promise<T>
): Promise<T> {
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  return new Promise((resolve, reject) => {
    ws.once('open', () => {
      fn(ws)
        .then(resolve, reject)
        .finally(() => ws.close());
    });
    ws.once('error', reject);
  });
}

/** CDP 요청 한 건 보내고 응답 대기. id는 내부 카운터로 자동 부여. timeout·close/error 시 reject. */
export function sendCdp(ws: WebSocket, method: string, params?: object): Promise<unknown> {
  const id = nextCdpId++;
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      ws.off('message', handler);
      ws.off('close', onClose);
      ws.off('error', onError);
      clearTimeout(timer);
    };
    const done = (err: Error | null, value?: unknown) => {
      cleanup();
      if (err) reject(err);
      else resolve(value);
    };
    const handler = (raw: Buffer) => {
      try {
        const msg = JSON.parse(raw.toString()) as {
          id?: number;
          error?: { message: string };
          result?: unknown;
        };
        if (msg.id === id) {
          if (msg.error) done(new Error(msg.error.message));
          else done(null, msg.result);
        }
      } catch {
        // ignore
      }
    };
    const onClose = () => done(new Error('CDP WebSocket closed before response'));
    const onError = (e: Error) => done(e ?? new Error('CDP WebSocket error'));
    const timer = setTimeout(
      () => done(new Error(`CDP request ${method} timed out after ${CDP_REQUEST_TIMEOUT_MS}ms`)),
      CDP_REQUEST_TIMEOUT_MS
    );
    ws.on('message', handler);
    ws.once('close', onClose);
    ws.once('error', onError);
    ws.send(JSON.stringify({ id, method, params: params ?? {} }), (err) => {
      if (err) done(err);
    });
  });
}

const PORTS = [9229, 9230, 9222, 9223, 9224, 9225];

export interface ElectronAppInfo {
  port: number;
  targets: Array<{
    id: string;
    title: string;
    url: string;
    type: string;
    description?: string;
    webSocketDebuggerUrl?: string;
  }>;
}

export interface WindowInfo {
  id: string;
  title: string;
  url: string;
  type: string;
  description: string;
  webSocketDebuggerUrl: string;
}

export interface ElectronWindowResult {
  platform: string;
  devToolsPort?: number;
  windows: WindowInfo[];
  totalTargets: number;
  electronTargets: number;
  message: string;
  automationReady: boolean;
}

/** 앱 한 개 분량 구조(두 군데 연결 시 apps 배열에 사용). */
export interface ElectronAppStructureItem {
  port: number;
  main: WindowInfo | null;
  renderers: WindowInfo[];
  message: string;
}

/** 메인(1) + 렌더러(여러) 구조와 각각에서 가능한 작업. MCP 클라이언트 사전 인지·동시 감시용. */
export interface ElectronProcessStructure {
  platform: string;
  port: number;
  /** 메인 프로세스(노드) 타깃 1개. Node 컨텍스트, DOM 없음. */
  main: WindowInfo | null;
  /** 렌더러 프로세스(페이지) 타깃. DOM, 스크린샷, 클릭 등. */
  renderers: WindowInfo[];
  /** 어디서 무엇이 가능한지 요약. */
  capabilities: {
    main: string[];
    renderers: string[];
  };
  message: string;
  automationReady: boolean;
  /** 스캔된 모든 앱(포트별). 두 군데(9229, 9230) 연결 시 여기서 확인. select_port로 작업할 앱 선택. */
  apps?: ElectronAppStructureItem[];
}

export interface DevToolsTarget {
  id: string;
  title: string;
  url: string;
  webSocketDebuggerUrl: string;
  type: string;
}

/** 스캔 실패 시 마지막 원인(디버깅용). */
let lastScanError: string | undefined;

export async function scanForElectronApps(): Promise<ElectronAppInfo[]> {
  const found: ElectronAppInfo[] = [];
  lastScanError = undefined;
  for (const port of PORTS) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json`, {
        signal: AbortSignal.timeout(2000),
      });
      if (!res.ok) {
        lastScanError = `port ${port}: HTTP ${res.status}`;
        continue;
      }
      const raw = await res.json();
      const targets = Array.isArray(raw)
        ? (raw as Array<{
            id: string;
            title: string;
            url: string;
            type: string;
            description?: string;
            webSocketDebuggerUrl?: string;
          }>)
        : [];
      const relevantTargets = targets.filter((t) => t && (t.type === 'page' || t.type === 'node'));
      if (relevantTargets.length > 0) {
        found.push({ port, targets: relevantTargets });
      } else {
        lastScanError = `port ${port}: ${targets.length} target(s), 0 with type 'page' or 'node'`;
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      lastScanError = `port ${port}: ${msg}`;
    }
  }
  return found;
}

export function getLastScanError(): string | undefined {
  return lastScanError;
}

/** 선택된 포트. select_port 도구로 설정. null이면 첫 번째 발견 앱 사용. */
let selectedPort: number | null = null;

export function getSelectedPort(): number | null {
  return selectedPort;
}

export function setSelectedPort(port: number | null): void {
  selectedPort = port;
}

/** 현재 작업할 앱(선택된 포트 또는 첫 번째 발견). 두 군데(9229, 9230) 스캔 후 하나만 조작할 때 사용. */
export async function getCurrentApp(): Promise<ElectronAppInfo | null> {
  const apps = await scanForElectronApps();
  if (apps.length === 0) return null;
  if (selectedPort != null) {
    const app = apps.find((a) => a.port === selectedPort);
    return app ?? apps[0];
  }
  return apps[0];
}

export function findMainTarget(
  targets: ElectronAppInfo['targets']
): (ElectronAppInfo['targets'][0] & { webSocketDebuggerUrl: string }) | null {
  const withWs = targets.filter(
    (t): t is typeof t & { webSocketDebuggerUrl: string } =>
      !!t.webSocketDebuggerUrl && t.type === 'page' && !(t.title || '').includes('DevTools')
  );
  return withWs[0] ?? targets.find((t) => t.webSocketDebuggerUrl) ?? null;
}

/** 렌더러(page) 타겟만 반환. 없으면 null. 콘솔 수집 시 메인만 있을 때 Page.enable 방지용. */
export async function findRendererTarget(): Promise<DevToolsTarget | null> {
  const app = await getCurrentApp();
  if (!app) return null;
  const withWs = app.targets.filter(
    (t): t is typeof t & { webSocketDebuggerUrl: string } =>
      !!t.webSocketDebuggerUrl && t.type === 'page' && !(t.title || '').includes('DevTools')
  );
  const t = selectedPageId ? (withWs.find((x) => x.id === selectedPageId) ?? withWs[0]) : withWs[0];
  if (!t) return null;
  return {
    id: t.id,
    title: t.title,
    url: t.url,
    webSocketDebuggerUrl: t.webSocketDebuggerUrl,
    type: t.type,
  };
}

export async function getElectronWindowInfo(
  includeChildren: boolean = false
): Promise<ElectronWindowResult> {
  try {
    const app = await getCurrentApp();
    if (!app) {
      const hint = getLastScanError() ? ` (last try: ${getLastScanError()})` : '';
      return {
        platform: process.platform,
        windows: [],
        totalTargets: 0,
        electronTargets: 0,
        message:
          'No Electron app with remote debugging found. Start with: electron . --remote-debugging-port=9222' +
          hint,
        automationReady: false,
      };
    }
    const windows: WindowInfo[] = app.targets.map((t) => ({
      id: t.id,
      title: t.title,
      url: t.url,
      type: t.type,
      description: t.description ?? '',
      webSocketDebuggerUrl: t.webSocketDebuggerUrl ?? '',
    }));
    const filtered = includeChildren
      ? windows
      : windows.filter((w) => !w.title.includes('DevTools'));
    return {
      platform: process.platform,
      devToolsPort: app.port,
      windows: filtered,
      totalTargets: windows.length,
      electronTargets: windows.length,
      message: `Found Electron app with ${windows.length} window(s) on port ${app.port}`,
      automationReady: true,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      platform: process.platform,
      windows: [],
      totalTargets: 0,
      electronTargets: 0,
      message: `Failed to scan: ${msg}`,
      automationReady: false,
    };
  }
}

/** 메인(1) + 렌더러(여러) 구조 반환. 두 군데 연결 시 apps에 모든 포트별 구조 포함. */
export async function getElectronProcessStructure(
  includeDevTools: boolean = false
): Promise<ElectronProcessStructure> {
  try {
    const apps = await scanForElectronApps();
    if (apps.length === 0) {
      const hint = getLastScanError() ? ` (last try: ${getLastScanError()})` : '';
      return {
        platform: process.platform,
        port: 0,
        main: null,
        renderers: [],
        capabilities: { main: [], renderers: [] },
        message:
          'No Electron app with remote debugging found. Start with: electron . --remote-debugging-port=9222' +
          hint,
        automationReady: false,
      };
    }
    const capabilities = {
      main: [
        'Runtime.evaluate (Node 컨텍스트). 메인 전용: app, BrowserWindow, ipcMain, dialog, shell, Menu, Tray, globalShortcut, protocol, Node(require/fs/path).',
        '메인 이벤트: app(ready, window-all-closed, before-quit, open-file, activate), BrowserWindow(ready-to-show, closed, did-finish-load), ipcMain(channel).',
        'DOM 없음 → 스크린샷/클릭/스냅샷 불가. 자세한 목록은 docs/electron-main-process.md 참고.',
      ],
      renderers: [
        'DOM 접근·클릭·스크린샷·스냅샷',
        'Runtime.evaluate (웹 페이지 컨텍스트)',
        'select_page로 id 선택 후 다른 도구 사용',
      ],
    };
    const appItems: ElectronAppStructureItem[] = apps.map((app) => {
      const all = app.targets
        .filter((t) => t.webSocketDebuggerUrl)
        .map((t) => ({
          id: t.id,
          title: t.title,
          url: t.url,
          type: t.type,
          description: t.description ?? '',
          webSocketDebuggerUrl: t.webSocketDebuggerUrl!,
        }));
      const mainTarget = all.find((t) => t.type === 'node') ?? null;
      const pageTargets = all.filter(
        (t) => t.type === 'page' && (includeDevTools || !(t.title || '').includes('DevTools'))
      );
      return {
        port: app.port,
        main: mainTarget,
        renderers: pageTargets,
        message: `port ${app.port}: main ${mainTarget ? '1' : '0'}, renderers ${pageTargets.length}`,
      };
    });
    const currentApp = await getCurrentApp();
    const app = currentApp ?? apps[0];
    const all = app.targets
      .filter((t) => t.webSocketDebuggerUrl)
      .map((t) => ({
        id: t.id,
        title: t.title,
        url: t.url,
        type: t.type,
        description: t.description ?? '',
        webSocketDebuggerUrl: t.webSocketDebuggerUrl!,
      }));
    const mainTarget = all.find((t) => t.type === 'node') ?? null;
    const pageTargets = all.filter(
      (t) => t.type === 'page' && (includeDevTools || !(t.title || '').includes('DevTools'))
    );
    return {
      platform: process.platform,
      port: app.port,
      main: mainTarget,
      renderers: pageTargets,
      capabilities,
      message:
        apps.length > 1
          ? `Electron 앱 ${apps.length}개 (ports ${apps.map((a) => a.port).join(', ')}). select_port로 작업할 앱 선택. 현재: port ${app.port}`
          : `Electron: main ${mainTarget ? '1' : '0'}, renderers ${pageTargets.length} (port ${app.port})`,
      automationReady: all.length > 0,
      apps: appItems.length > 0 ? appItems : undefined,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      platform: process.platform,
      port: 0,
      main: null,
      renderers: [],
      capabilities: { main: [], renderers: [] },
      message: `Failed to scan: ${msg}`,
      automationReady: false,
    };
  }
}

/** 선택된 페이지 ID. select_page 도구로 설정하며, findElectronTarget에서 사용. */
let selectedPageId: string | null = null;

export function getSelectedPageId(): string | null {
  return selectedPageId;
}

export function setSelectedPageId(pageId: string | null): void {
  selectedPageId = pageId;
}

/** 메인 프로세스(node) 타깃 반환. 없으면 null. 콘솔 수집 등에서 사용. */
export async function getMainProcessTarget(): Promise<DevToolsTarget | null> {
  const app = await getCurrentApp();
  if (!app) return null;
  const t = app.targets.find(
    (x): x is typeof x & { webSocketDebuggerUrl: string } =>
      !!x.webSocketDebuggerUrl && x.type === 'node'
  );
  if (!t) return null;
  return {
    id: t.id,
    title: t.title,
    url: t.url,
    webSocketDebuggerUrl: t.webSocketDebuggerUrl,
    type: t.type,
  };
}

/** pageId에 해당하는 CDP 타겟 반환. 없으면 null. */
export async function getTargetByPageId(pageId: string): Promise<DevToolsTarget | null> {
  const apps = await scanForElectronApps();
  for (const app of apps) {
    const t = app.targets.find(
      (x): x is typeof x & { webSocketDebuggerUrl: string } =>
        x.id === pageId && !!x.webSocketDebuggerUrl && (x.type === 'page' || x.type === 'node')
    );
    if (t) {
      return {
        id: t.id,
        title: t.title,
        url: t.url,
        webSocketDebuggerUrl: t.webSocketDebuggerUrl,
        type: t.type,
      };
    }
  }
  return null;
}

export async function findElectronTarget(): Promise<DevToolsTarget> {
  const app = await getCurrentApp();
  if (!app) {
    const hint = getLastScanError() ? ` (${getLastScanError()})` : '';
    throw new Error(
      'No Electron app with remote debugging. Start with: electron . --remote-debugging-port=9222' +
        hint
    );
  }
  if (selectedPageId) {
    const selected = await getTargetByPageId(selectedPageId);
    if (selected) return selected;
    selectedPageId = null;
  }
  const main = findMainTarget(app.targets);
  if (!main?.webSocketDebuggerUrl) {
    throw new Error('No suitable CDP target found.');
  }
  return {
    id: main.id,
    title: main.title,
    url: main.url,
    webSocketDebuggerUrl: main.webSocketDebuggerUrl,
    type: main.type,
  };
}

export function executeInElectron(
  javascriptCode: string,
  target?: DevToolsTarget
): Promise<string> {
  return (async () => {
    const targetInfo = target ?? (await findElectronTarget());
    if (!targetInfo.webSocketDebuggerUrl) {
      throw new Error('No WebSocket debugger URL');
    }
    const ws = new WebSocket(targetInfo.webSocketDebuggerUrl);
    const messageId = Math.floor(Math.random() * 1000000);
    return new Promise<string>((resolve, reject) => {
      const timeout = setTimeout(() => {
        ws.close();
        reject(new Error('Command execution timeout (10s)'));
      }, 10000);

      ws.on('open', () => {
        ws.send(JSON.stringify({ id: 1, method: 'Runtime.enable' }));
        ws.send(
          JSON.stringify({
            id: messageId,
            method: 'Runtime.evaluate',
            params: {
              expression: javascriptCode,
              returnByValue: true,
              awaitPromise: true,
              // Node 인스펙터에서 require는 Command Line API로만 노출됨. true여야 메인 프로세스에서 require('os') 등 사용 가능.
              includeCommandLineAPI: true,
            },
          })
        );
      });

      ws.on('message', (data: Buffer) => {
        try {
          const response = JSON.parse(data.toString());
          if (response.id !== messageId) return;
          clearTimeout(timeout);
          ws.close();
          if (response.error) {
            reject(new Error(response.error.message || JSON.stringify(response.error)));
            return;
          }
          const result = response.result?.result;
          if (!result) {
            resolve('OK');
            return;
          }
          if (result.type === 'string') {
            resolve(String(result.value));
          } else if (result.type === 'number' || result.type === 'boolean') {
            resolve(String(result.value));
          } else if (result.type === 'undefined') {
            resolve('(undefined)');
          } else if (result.type === 'object' && result.value !== undefined) {
            resolve(JSON.stringify(result.value, null, 2));
          } else {
            resolve(result.description || String(result.value));
          }
        } catch {
          // ignore parse errors for other messages
        }
      });

      ws.on('error', (err: Error) => {
        clearTimeout(timeout);
        reject(err);
      });
    });
  })();
}
