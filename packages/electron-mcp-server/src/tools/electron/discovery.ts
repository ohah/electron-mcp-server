/**
 * Electron 앱 발견: 포트 스캔, 타겟 조회, 앱 선택.
 */

import { PORTS } from '../constants';
import { createLogger } from '../logger';
import type {
  ElectronAppInfo,
  DevToolsTarget,
  WindowInfo,
  ElectronWindowResult,
  ElectronProcessStructure,
  ElectronAppStructureItem,
} from './types';

const logger = createLogger('discovery');

/** 스캔 실패 시 마지막 원인(디버깅용). */
let lastScanError: string | undefined;

/** 스캔 결과 캐시. 짧은 TTL(1초)로 동일 호출 체인 내 중복 스캔 방지. */
const SCAN_CACHE_TTL_MS = 1_000;
let scanCache: { result: ElectronAppInfo[]; timestamp: number } | null = null;

/** 단일 포트 스캔 */
async function scanPort(
  port: number
): Promise<
  { port: number; targets: ElectronAppInfo['targets'] } | { port: number; error: string }
> {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/json`, {
      signal: AbortSignal.timeout(2000),
    });
    if (!res.ok) {
      return { port, error: `HTTP ${res.status}` };
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
      return { port, targets: relevantTargets };
    }
    return { port, error: `${targets.length} target(s), 0 with type 'page' or 'node'` };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { port, error: msg };
  }
}

export async function scanForElectronApps(): Promise<ElectronAppInfo[]> {
  // 캐시 히트: TTL 내 이전 결과 재사용
  if (scanCache && Date.now() - scanCache.timestamp < SCAN_CACHE_TTL_MS) {
    return scanCache.result;
  }

  lastScanError = undefined;

  // 모든 포트를 병렬 스캔
  const results = await Promise.all(PORTS.map(scanPort));

  const found: ElectronAppInfo[] = [];
  for (const r of results) {
    if ('targets' in r) {
      found.push({ port: r.port, targets: r.targets });
      logger.debug(`Found app on port ${r.port}`, { targets: r.targets.length });
    } else {
      lastScanError = `port ${r.port}: ${r.error}`;
    }
  }

  scanCache = { result: found, timestamp: Date.now() };
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
  logger.info(`Port selected: ${port ?? 'auto'}`);
}

/** 현재 작업할 앱(선택된 포트 또는 첫 번째 발견). */
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

/** 선택된 페이지 ID. select_page 도구로 설정하며, findElectronTarget에서 사용. */
let selectedPageId: string | null = null;

export function getSelectedPageId(): string | null {
  return selectedPageId;
}

export function setSelectedPageId(pageId: string | null): void {
  selectedPageId = pageId;
}

/** 선택된 포트를 우선 배치한 앱 목록 반환. */
function orderBySelectedPort(apps: ElectronAppInfo[]): ElectronAppInfo[] {
  if (selectedPort == null) return apps;
  return [
    apps.find((a) => a.port === selectedPort),
    ...apps.filter((a) => a.port !== selectedPort),
  ].filter(Boolean) as ElectronAppInfo[];
}

/** 렌더러(page) 타겟만 반환. 선택된 포트에 없으면 다른 포트에서도 검색. 없으면 null. */
export async function findRendererTarget(): Promise<DevToolsTarget | null> {
  const apps = await scanForElectronApps();
  if (apps.length === 0) return null;

  const ordered = orderBySelectedPort(apps);

  for (const app of ordered) {
    const withWs = app.targets.filter(
      (t): t is typeof t & { webSocketDebuggerUrl: string } =>
        !!t.webSocketDebuggerUrl && t.type === 'page' && !(t.title || '').includes('DevTools')
    );
    const t = selectedPageId
      ? (withWs.find((x) => x.id === selectedPageId) ?? withWs[0])
      : withWs[0];
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

/** 메인 프로세스(node) 타깃 반환. */
export async function getMainProcessTarget(): Promise<DevToolsTarget | null> {
  const apps = await scanForElectronApps();
  if (apps.length === 0) return null;

  const ordered = orderBySelectedPort(apps);

  for (const app of ordered) {
    const t = app.targets.find(
      (x): x is typeof x & { webSocketDebuggerUrl: string } =>
        !!x.webSocketDebuggerUrl && x.type === 'node'
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
  if (selectedPageId) {
    const selected = await getTargetByPageId(selectedPageId);
    if (selected) return selected;
    selectedPageId = null;
  }
  const renderer = await findRendererTarget();
  if (renderer) return renderer;

  const app = await getCurrentApp();
  if (!app) {
    const hint = getLastScanError() ? ` (${getLastScanError()})` : '';
    throw new Error(
      'No Electron app with remote debugging. Start with: electron . --remote-debugging-port=9222' +
        hint
    );
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
        'Runtime.evaluate (Node context). Main-only: app, BrowserWindow, ipcMain, dialog, shell, Menu, Tray, globalShortcut, protocol, Node(require/fs/path).',
        'Main events: app(ready, window-all-closed, before-quit, open-file, activate), BrowserWindow(ready-to-show, closed, did-finish-load), ipcMain(channel).',
        'No DOM → no screenshot/click/snapshot. See docs/electron-main-process.md for details.',
      ],
      renderers: [
        'DOM access, click, screenshot, snapshot',
        'Runtime.evaluate (web page context)',
        'Use select_page to pick id then use other tools',
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
    const currentItem = appItems.find((item) => item.port === app.port) ?? appItems[0];
    return {
      platform: process.platform,
      port: app.port,
      main: currentItem.main,
      renderers: currentItem.renderers,
      capabilities,
      message:
        apps.length > 1
          ? `${apps.length} Electron app(s) (ports ${apps.map((a) => a.port).join(', ')}). Use select_port to choose. Current: port ${app.port}`
          : `Electron: main ${currentItem.main ? '1' : '0'}, renderers ${currentItem.renderers.length} (port ${app.port})`,
      automationReady: currentItem.main != null || currentItem.renderers.length > 0,
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
