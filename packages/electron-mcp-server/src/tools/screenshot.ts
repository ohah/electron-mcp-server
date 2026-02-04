/**
 * take_screenshot — 현재 페이지(또는 선택된 페이지)의 스크린샷을 캡처합니다.
 * 레퍼런스(halilural/electron-mcp-server)와 동일한 스키마: outputPath, windowTitle.
 * CDP Page.captureScreenshot 사용.
 * @see https://github.com/ohah/electron-mcp-server/issues/3
 */

import * as path from 'path';
import * as fs from 'fs/promises';
import { z } from 'zod';
import { WebSocket } from 'ws';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { findElectronTarget, sendCdp, scanForElectronApps, type DevToolsTarget } from './electron';

const takeScreenshotSchema = z.object({
  outputPath: z
    .string()
    .optional()
    .describe('Path to save the screenshot (optional, defaults to in-memory only)'),
  windowTitle: z
    .string()
    .optional()
    .describe(
      'Specific window title to screenshot (optional). Matches when page title includes this string.'
    ),
  format: z.enum(['png', 'jpeg']).optional().default('png').describe('Image format'),
  quality: z.number().min(1).max(100).optional().describe('JPEG quality (1–100)'),
});

/** 레퍼런스와 동일: 스크린샷 저장 경로가 허용된 위치인지 검사 */
function validateScreenshotPath(outputPath: string): boolean {
  const normalizedPath = path.normalize(outputPath);

  const dangerousPaths = [
    '/etc/',
    '/sys/',
    '/proc/',
    '/dev/',
    '/bin/',
    '/sbin/',
    '/usr/bin/',
    '/usr/sbin/',
    '/root/',
    '/home/',
    '/.ssh/',
    'C:\\Windows\\System32\\',
    'C:\\Windows\\SysWOW64\\',
    'C:\\Program Files\\',
    'C:\\Users\\',
    '\\Windows\\System32\\',
    '\\Windows\\SysWOW64\\',
    '\\Program Files\\',
    '\\Users\\',
  ];

  for (const dangerousPath of dangerousPaths) {
    if (normalizedPath.toLowerCase().includes(dangerousPath.toLowerCase())) {
      return false;
    }
  }

  if (normalizedPath.includes('..') || normalizedPath.includes('~')) {
    return false;
  }

  if (path.isAbsolute(normalizedPath)) {
    const absolutePath = normalizedPath.toLowerCase();
    if (
      absolutePath.startsWith('/etc') ||
      absolutePath.startsWith('/sys') ||
      absolutePath.startsWith('/proc') ||
      absolutePath.startsWith('c:\\windows') ||
      absolutePath.startsWith('c:\\program files')
    ) {
      return false;
    }
  }

  return true;
}

async function resolveTarget(windowTitle?: string): Promise<DevToolsTarget> {
  if (windowTitle) {
    const apps = await scanForElectronApps();
    if (apps.length > 0) {
      const target = apps[0].targets.find(
        (t): t is typeof t & { webSocketDebuggerUrl: string } =>
          !!t.webSocketDebuggerUrl &&
          t.type === 'page' &&
          !(t.title || '').includes('DevTools') &&
          (t.title || '').toLowerCase().includes(windowTitle.toLowerCase())
      );
      if (target) {
        return {
          id: target.id,
          title: target.title,
          url: target.url,
          webSocketDebuggerUrl: target.webSocketDebuggerUrl,
          type: target.type,
        };
      }
    }
  }
  return findElectronTarget();
}

async function takeScreenshotImpl(
  target: DevToolsTarget,
  format: 'png' | 'jpeg' = 'png',
  quality?: number
): Promise<{ data: string; mimeType: string }> {
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise<void>((resolve, reject) => {
    ws.once('open', () => resolve());
    ws.once('error', reject);
  });

  try {
    await sendCdp(ws, 'Page.enable');
    const params: { format?: string; quality?: number } = { format };
    if (format === 'jpeg' && quality != null) params.quality = quality;
    const result = (await sendCdp(ws, 'Page.captureScreenshot', params)) as { data?: string };
    const data = result?.data;
    if (!data || typeof data !== 'string') {
      throw new Error('Page.captureScreenshot returned no data');
    }
    return {
      data,
      mimeType: format === 'jpeg' ? 'image/jpeg' : 'image/png',
    };
  } finally {
    ws.close();
  }
}

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
    'take_screenshot',
    {
      description:
        'Take a screenshot of the selected (or windowTitle-matched) Electron page. Returns base64 image. Optionally save to outputPath (validated for security). Same API as reference halilural/electron-mcp-server.',
      inputSchema: takeScreenshotSchema,
    },
    async (args) => {
      const { outputPath, windowTitle, format, quality } = takeScreenshotSchema.parse(args);

      if (outputPath && !validateScreenshotPath(outputPath)) {
        throw new Error(
          `Invalid output path: ${outputPath}. Path appears to target a restricted system location.`
        );
      }

      const target = await resolveTarget(windowTitle);
      if (target.type === 'node') {
        throw new Error(
          'Screenshot is only supported for page targets (renderer). The current target is the main process (node). Use list_pages and select_page to choose a page target.'
        );
      }
      const { data, mimeType } = await takeScreenshotImpl(
        target,
        format as 'png' | 'jpeg',
        quality
      );

      let text: string;
      if (outputPath) {
        const buffer = Buffer.from(data, 'base64');
        await fs.writeFile(outputPath, buffer);
        text = `Screenshot saved to: ${outputPath}`;
      } else {
        text = 'Screenshot captured in memory (no file saved)';
      }

      return {
        content: [
          { type: 'text' as const, text },
          { type: 'image' as const, data, mimeType },
        ],
      };
    }
  );
}
