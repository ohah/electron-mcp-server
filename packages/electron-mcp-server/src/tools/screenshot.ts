/**
 * MCP tool: take_screenshot
 * CDP Page.captureScreenshot 사용 (Playwright 없음).
 */

import path from 'node:path';
import { z } from 'zod';
import { WebSocket } from 'ws';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { scanForElectronApps, findMainTarget, type ElectronAppInfo } from './electron';

function resolveSafeOutputPath(outputPath: string): string {
  const resolved = path.resolve(process.cwd(), outputPath);
  const relative = path.relative(process.cwd(), resolved);
  if (relative.startsWith('..')) {
    throw new Error('outputPath must be under the current working directory');
  }
  return resolved;
}

function selectTarget(apps: ElectronAppInfo[], windowTitle?: string): { wsUrl: string } {
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

/** 스크립트(try-screenshot)에서도 사용. */
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

const schema = z.object({
  outputPath: z.string().optional().describe('Optional file path to save'),
  windowTitle: z.string().optional().describe('Filter by window title'),
});

export const takeScreenshotTool = {
  name: 'take_screenshot' as const,
  description: 'Take a screenshot of a running Electron app. Returns base64 PNG.',
  inputSchema: schema,
  handler: async (args: z.infer<typeof schema>) => {
    const { base64, filePath } = await takeScreenshot(args?.outputPath, args?.windowTitle);
    const content: Array<
      { type: 'text'; text: string } | { type: 'image'; data: string; mimeType: string }
    > = [];
    if (filePath) {
      content.push({ type: 'text', text: `Saved: ${filePath}` });
    }
    content.push({
      type: 'image',
      data: base64,
      mimeType: 'image/png',
    });
    return { content };
  },
};

export function registerTakeScreenshot(server: McpServer): void {
  (
    server as {
      registerTool(
        name: string,
        def: { description: string; inputSchema: z.ZodTypeAny },
        handler: (args: unknown) => Promise<unknown>
      ): void;
    }
  ).registerTool(
    takeScreenshotTool.name,
    {
      description: takeScreenshotTool.description,
      inputSchema: takeScreenshotTool.inputSchema,
    },
    (args: unknown) => takeScreenshotTool.handler(args as z.infer<typeof schema>)
  );
}
