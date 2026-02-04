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
  findElectronTarget,
  setSelectedPageId,
  getTargetByPageId,
  sendCdp,
  withCdpWs,
  executeInElectron,
  type DevToolsTarget,
} from './electron';

const listPagesSchema = z.object({});

const navigatePageSchema = z.object({
  url: z.string().optional().describe('이동할 URL (type이 url일 때 사용)'),
  type: z
    .enum(['url', 'back', 'forward', 'reload'])
    .optional()
    .default('url')
    .describe('동작: url | back | forward | reload'),
  timeout: z.number().optional().describe('내비게이션 타임아웃(ms)'),
  ignoreCache: z.boolean().optional().describe('캐시 무시(리로드 시)'),
});

const newPageSchema = z.object({
  url: z.string().optional().describe('새 페이지에 로드할 URL'),
  background: z.boolean().optional().describe('백그라운드 탭 여부'),
  timeout: z.number().optional().describe('타임아웃(ms)'),
});

const selectPageSchema = z.object({
  pageId: z.string().describe('선택할 페이지 ID (list_pages에서 얻은 id)'),
  bringToFront: z.boolean().optional().describe('창을 앞으로 가져올지 여부 (CDP 모드에서는 무시)'),
});

const closePageSchema = z.object({
  pageId: z.string().describe('닫을 페이지 ID'),
});

const waitForSchema = z.object({
  text: z
    .string()
    .min(1, 'text must be non-empty')
    .describe('페이지에 나타날 때까지 기다릴 텍스트'),
  timeout: z.number().optional().default(30_000).describe('대기 타임아웃(ms)'),
});

const CDP_NAVIGATION_TIMEOUT_MS = 30_000;
const WAIT_FOR_POLL_MS = 500;

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
      description: '열린 페이지(탭/창) 목록 조회. id는 select_page·close_page 등에서 사용.',
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
      const app = apps[0];
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
      description: '이후 도구 호출의 컨텍스트가 될 페이지 선택. pageId는 list_pages에서 얻은 id.',
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
        'URL 이동(type=url), 뒤로(type=back), 앞으로(type=forward), 새로고침(type=reload).',
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
      description: '지정한 텍스트가 페이지 본문에 나타날 때까지 대기.',
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
        '페이지 ID(pageId)로 지정된 탭/창 닫기. pageId 값은 list_pages 결과의 id를 사용. CDP 단독 모드에서는 앱이 창을 닫는 API를 노출해야 함.',
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
        '새 페이지(탭/창) 열기. CDP 단독 모드에서는 앱이 새 창을 만드는 API를 노출해야 함.',
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
