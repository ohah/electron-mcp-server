/**
 * Electron/CDP 공통: 앱 발견, 타겟 조회, JS 실행, CDP 명령.
 * 여러 툴에서 공유하므로 tools/electron/ 으로 두고 index 로 노출.
 * Ports 9222–9225 스캔.
 */

import WebSocket from 'ws';

/** 프로세스 전역 CDP 요청 id. 멀티 윈도우·동시 호출 시에도 응답 매칭 충돌 방지. */
let nextCdpId = 1;

/** CDP 요청 한 건 보내고 응답 대기. id는 내부 카운터로 자동 부여. */
export function sendCdp(ws: WebSocket, method: string, params?: object): Promise<unknown> {
  const id = nextCdpId++;
  return new Promise((resolve, reject) => {
    const handler = (raw: Buffer) => {
      try {
        const msg = JSON.parse(raw.toString()) as {
          id?: number;
          error?: { message: string };
          result?: unknown;
        };
        if (msg.id === id) {
          ws.off('message', handler);
          if (msg.error) reject(new Error(msg.error.message));
          else resolve(msg.result);
        }
      } catch {
        // ignore
      }
    };
    ws.on('message', handler);
    ws.send(JSON.stringify({ id, method, params: params ?? {} }), (err) => {
      if (err) {
        ws.off('message', handler);
        reject(err);
      }
    });
  });
}

const PORTS = [9222, 9223, 9224, 9225, 9229];

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
      const pageTargets = targets.filter((t) => t && t.type === 'page');
      if (pageTargets.length > 0) {
        found.push({ port, targets: pageTargets });
        return found;
      }
      lastScanError = `port ${port}: ${targets.length} target(s), 0 with type 'page'`;
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

export function findMainTarget(
  targets: ElectronAppInfo['targets']
): (ElectronAppInfo['targets'][0] & { webSocketDebuggerUrl: string }) | null {
  const withWs = targets.filter(
    (t): t is typeof t & { webSocketDebuggerUrl: string } =>
      !!t.webSocketDebuggerUrl && t.type === 'page' && !(t.title || '').includes('DevTools')
  );
  return withWs[0] ?? targets.find((t) => t.webSocketDebuggerUrl) ?? null;
}

export async function getElectronWindowInfo(
  includeChildren: boolean = false
): Promise<ElectronWindowResult> {
  try {
    const apps = await scanForElectronApps();
    if (apps.length === 0) {
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
    const app = apps[0];
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

export async function findElectronTarget(): Promise<DevToolsTarget> {
  const apps = await scanForElectronApps();
  if (apps.length === 0) {
    const hint = getLastScanError() ? ` (${getLastScanError()})` : '';
    throw new Error(
      'No Electron app with remote debugging. Start with: electron . --remote-debugging-port=9222' +
        hint
    );
  }
  const app = apps[0];
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
