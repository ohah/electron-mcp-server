/**
 * Discovers Electron apps with remote debugging (CDP) enabled.
 * Ports 9222–9225 are scanned (same as reference).
 */

const PORTS = [9222, 9223, 9224, 9225];

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

export async function scanForElectronApps(): Promise<ElectronAppInfo[]> {
  const found: ElectronAppInfo[] = [];
  for (const port of PORTS) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json`, {
        signal: AbortSignal.timeout(2000),
      });
      if (!res.ok) continue;
      const targets = (await res.json()) as Array<{
        id: string;
        title: string;
        url: string;
        type: string;
        description?: string;
        webSocketDebuggerUrl?: string;
      }>;
      const pageTargets = targets.filter((t) => t.type === 'page');
      if (pageTargets.length > 0) {
        found.push({ port, targets: pageTargets });
      }
    } catch {
      // skip port
    }
  }
  return found;
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
      return {
        platform: process.platform,
        windows: [],
        totalTargets: 0,
        electronTargets: 0,
        message:
          'No Electron app with remote debugging found. Start with: electron . --remote-debugging-port=9222',
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
