/**
 * 내비게이션 (Navigation automation) — 이슈 #3 로드맵
 * list_pages, select_page, navigate_page, wait_for 실구현.
 * close_page, new_page는 CDP 단독 모드 제한으로 안내만 반환.
 * @see https://github.com/ohah/electron-mcp-server/issues/3
 * @see docs/MCP-SERVER-DESIGN.md (Chrome DevTools MCP 파라미터 스펙)
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  scanForElectronApps,
  getLastScanError,
  getCurrentApp,
  findElectronTarget,
  setSelectedPageId,
  getTargetByPageId,
  sendCdp,
  withCdpWs,
  executeInElectron,
  type DevToolsTarget,
} from './electron';
import { CDP_NAVIGATION_TIMEOUT_MS, WAIT_FOR_POLL_MS } from './constants';

const listPagesSchema = z.object({});

const navigatePageSchema = z.object({
  url: z.string().optional().describe('URL to navigate to (when type is url)'),
  type: z
    .enum(['url', 'back', 'forward', 'reload'])
    .optional()
    .default('url')
    .describe('Action: url | back | forward | reload'),
  timeout: z.number().optional().describe('Navigation timeout (ms)'),
  ignoreCache: z.boolean().optional().describe('Ignore cache (on reload)'),
});

const newPageSchema = z.object({
  url: z.string().optional().describe('URL to load in the new page'),
  background: z.boolean().optional().describe('Open as background tab'),
  timeout: z.number().optional().describe('Timeout (ms)'),
});

const selectPageSchema = z.object({
  pageId: z.string().describe('Page ID to select (from list_pages)'),
  bringToFront: z.boolean().optional().describe('Bring window to front (ignored in CDP-only mode)'),
});

const closePageSchema = z.object({
  pageId: z.string().describe('Page ID to close'),
});

const waitForSchema = z.object({
  text: z.string().min(1, 'text must be non-empty').describe('Text to wait for in the page body'),
  timeout: z.number().optional().default(30_000).describe('Wait timeout (ms)'),
});

async function navigatePageImpl(
  target: DevToolsTarget,
  params: z.infer<typeof navigatePageSchema>
): Promise<string> {
  const { type, url, timeout = CDP_NAVIGATION_TIMEOUT_MS, ignoreCache } = params;
  if (type === 'url') {
    if (!url) throw new Error('navigate_page type "url" requires "url" parameter.');
    return withCdpWs(target, async (ws) => {
      await sendCdp(ws, 'Page.enable');
      const result = (await sendCdp(ws, 'Page.navigate', {
        url,
        ...(timeout ? { timeout: Math.min(timeout, CDP_NAVIGATION_TIMEOUT_MS) } : {}),
      })) as { errorText?: string };
      if (result?.errorText) throw new Error(result.errorText);
      return `Navigated to ${url}`;
    });
  }
  if (type === 'reload') {
    return withCdpWs(target, async (ws) => {
      await sendCdp(ws, 'Page.enable');
      await sendCdp(ws, 'Page.reload', { ignoreCache: !!ignoreCache });
      return 'Page reloaded';
    });
  }
  if (type === 'back' || type === 'forward') {
    const code = type === 'back' ? 'window.history.back()' : 'window.history.forward()';
    await executeInElectron(code, target);
    return type === 'back' ? 'Navigated back' : 'Navigated forward';
  }
  throw new Error(`Unknown navigate_page type: ${type}`);
}

export function registerNavigationTools(server: McpServer): void {
  (
    server as {
      registerTool(
        name: string,
        def: { description: string; inputSchema: z.ZodTypeAny },
        handler: (args: unknown) => Promise<unknown>
      ): void;
    }
  ).registerTool(
    'list_pages',
    {
      description:
        'List open pages (tabs/windows). Use returned id in select_page, close_page, etc.',
      inputSchema: listPagesSchema,
    },
    async () => {
      const apps = await scanForElectronApps();
      if (apps.length === 0) {
        const hint = getLastScanError() ? ` (${getLastScanError()})` : '';
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(
                {
                  pages: [],
                  message:
                    'No Electron app with remote debugging. Start with: electron . --remote-debugging-port=9222' +
                    hint,
                },
                null,
                2
              ),
            },
          ],
        };
      }
      const app = await getCurrentApp();
      if (!app) {
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(
                { pages: [], message: 'No Electron app (getCurrentApp returned null).' },
                null,
                2
              ),
            },
          ],
        };
      }
      const pages = app.targets
        .filter(
          (t) => (t.type === 'page' || t.type === 'node') && !(t.title || '').includes('DevTools')
        )
        .map((t, index) => ({
          index,
          id: t.id,
          title: t.title,
          url: t.url,
          type: t.type,
        }));
      return {
        content: [{ type: 'text' as const, text: JSON.stringify({ pages }, null, 2) }],
      };
    }
  );

  (
    server as {
      registerTool(
        name: string,
        def: { description: string; inputSchema: z.ZodTypeAny },
        handler: (args: unknown) => Promise<unknown>
      ): void;
    }
  ).registerTool(
    'select_page',
    {
      description:
        'Select the page that will be the context for subsequent tool calls. pageId from list_pages.',
      inputSchema: selectPageSchema,
    },
    async (args: unknown) => {
      const { pageId } = selectPageSchema.parse(args);
      const target = await getTargetByPageId(pageId);
      if (!target) {
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                ok: false,
                message: `Page not found: ${pageId}. Use list_pages to see available ids.`,
              }),
            },
          ],
        };
      }
      setSelectedPageId(pageId);
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              ok: true,
              pageId,
              title: target.title,
              url: target.url,
            }),
          },
        ],
      };
    }
  );

  (
    server as {
      registerTool(
        name: string,
        def: { description: string; inputSchema: z.ZodTypeAny },
        handler: (args: unknown) => Promise<unknown>
      ): void;
    }
  ).registerTool(
    'navigate_page',
    {
      description:
        'Navigate: go to URL (type=url), back (type=back), forward (type=forward), reload (type=reload).',
      inputSchema: navigatePageSchema,
    },
    async (args: unknown) => {
      const params = navigatePageSchema.parse(args);
      const target = await findElectronTarget();
      const msg = await navigatePageImpl(target, params);
      return { content: [{ type: 'text' as const, text: msg }] };
    }
  );

  (
    server as {
      registerTool(
        name: string,
        def: { description: string; inputSchema: z.ZodTypeAny },
        handler: (args: unknown) => Promise<unknown>
      ): void;
    }
  ).registerTool(
    'wait_for',
    {
      description: 'Wait until the given text appears in the page body.',
      inputSchema: waitForSchema,
    },
    async (args: unknown) => {
      const { text, timeout } = waitForSchema.parse(args);
      const target = await findElectronTarget();
      const deadline = Date.now() + timeout;
      const escaped = JSON.stringify(text);
      const expr = `(function(){ var body = document.body && document.body.innerText; return body ? body.includes(${escaped}) : false; })()`;
      while (Date.now() < deadline) {
        const result = await executeInElectron(expr, target);
        if (result === 'true') {
          return {
            content: [{ type: 'text' as const, text: `Found text: "${text}"` }],
          };
        }
        await new Promise((r) => setTimeout(r, WAIT_FOR_POLL_MS));
      }
      return {
        content: [
          {
            type: 'text' as const,
            text: `Timeout ${timeout}ms: text "${text}" did not appear.`,
          },
        ],
      };
    }
  );

  (
    server as {
      registerTool(
        name: string,
        def: { description: string; inputSchema: z.ZodTypeAny },
        handler: (args: unknown) => Promise<unknown>
      ): void;
    }
  ).registerTool(
    'close_page',
    {
      description:
        'Close the tab/window for the given page ID (from list_pages). In CDP-only mode the app must expose a close-window API.',
      inputSchema: closePageSchema,
    },
    async (args: unknown) => {
      closePageSchema.parse(args);
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              ok: false,
              message:
                'close_page is not supported when the MCP server connects via CDP only. The Electron app must expose closing a window (e.g. via IPC or send_command_to_electron). Use list_pages to see page ids.',
            }),
          },
        ],
      };
    }
  );

  (
    server as {
      registerTool(
        name: string,
        def: { description: string; inputSchema: z.ZodTypeAny },
        handler: (args: unknown) => Promise<unknown>
      ): void;
    }
  ).registerTool(
    'new_page',
    {
      description:
        'Open a new page (tab/window). In CDP-only mode the app must expose an API to create new windows.',
      inputSchema: newPageSchema,
    },
    async (args: unknown) => {
      newPageSchema.parse(args);
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              ok: false,
              message:
                'new_page is not supported when the MCP server connects via CDP only. Start a new window from the Electron app, then use list_pages and select_page to switch to it.',
            }),
          },
        ],
      };
    }
  );
}
