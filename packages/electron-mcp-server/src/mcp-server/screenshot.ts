/**
 * Take screenshot of a running Electron app via CDP only (no Playwright).
 * Connects to the page's webSocketDebuggerUrl and sends Page.captureScreenshot.
 */

import path from 'node:path';
import { WebSocket } from 'ws';
import { scanForElectronApps, findMainTarget } from './discovery';

/** Resolve outputPath and ensure it is under cwd to prevent path traversal. */
function resolveSafeOutputPath(outputPath: string): string {
  const resolved = path.resolve(process.cwd(), outputPath);
  const relative = path.relative(process.cwd(), resolved);
  if (relative.startsWith('..')) {
    throw new Error('outputPath must be under the current working directory');
  }
  return resolved;
}

function selectTarget(
  apps: Awaited<ReturnType<typeof scanForElectronApps>>,
  windowTitle?: string
): { wsUrl: string } {
  const app = apps[0]!;
  const targets = app.targets.filter(
    (t): t is typeof t & { webSocketDebuggerUrl: string } =>
      !!t.webSocketDebuggerUrl && t.type === 'page' && !(t.title || '').includes('DevTools')
  );
  const chosen =
    (windowTitle
      ? targets.find((t) => (t.title || '').toLowerCase().includes(windowTitle.toLowerCase()))
      : findMainTarget(app.targets)) ?? targets[0];
  if (!chosen?.webSocketDebuggerUrl) {
    throw new Error('No page target with webSocketDebuggerUrl found');
  }
  return { wsUrl: chosen.webSocketDebuggerUrl };
}

/** Send a CDP method and wait for the response (by id). */
function sendCdp(ws: WebSocket, id: number, method: string, params?: object): Promise<unknown> {
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
        // ignore non-matching or invalid messages
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

export async function takeScreenshot(
  outputPath?: string,
  windowTitle?: string
): Promise<{ filePath?: string; base64: string }> {
  const apps = await scanForElectronApps();
  if (apps.length === 0) {
    throw new Error(
      'No Electron app with remote debugging. Start with: electron . --remote-debugging-port=9222'
    );
  }
  let app = apps[0]!;
  if (windowTitle) {
    const byTitle = apps.find((a) =>
      a.targets.some((t) => (t.title || '').toLowerCase().includes(windowTitle.toLowerCase()))
    );
    if (byTitle) app = byTitle;
  }
  const { wsUrl } = selectTarget([app], windowTitle);

  const ws = new WebSocket(wsUrl);
  await new Promise<void>((resolve, reject) => {
    ws.once('open', () => resolve());
    ws.once('error', reject);
  });

  try {
    await sendCdp(ws, 1, 'Page.enable');
    const result = (await sendCdp(ws, 2, 'Page.captureScreenshot', { format: 'png' })) as {
      data?: string;
    };
    const base64 = result?.data ?? '';
    if (!base64) throw new Error('Page.captureScreenshot returned no data');

    if (outputPath) {
      const safePath = resolveSafeOutputPath(outputPath);
      const buffer = Buffer.from(base64, 'base64');
      const fs = await import('fs/promises');
      await fs.writeFile(safePath, buffer);
      return { filePath: safePath, base64 };
    }
    return { base64 };
  } finally {
    ws.close();
  }
}
