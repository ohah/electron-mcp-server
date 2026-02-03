/**
 * 내비게이션 (Navigation automation) — 로드맵 스텁
 * @see https://github.com/ohah/electron-mcp-server/issues/3
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

const emptySchema = z.object({});
const TODO_MSG = 'TODO: Chrome DevTools MCP 로드맵 기능 — 미구현';

function registerStub(
  server: McpServer,
  name: string,
  description: string,
  inputSchema: z.ZodTypeAny = emptySchema
): void {
  (
    server as {
      registerTool(
        name: string,
        def: { description: string; inputSchema: z.ZodTypeAny },
        handler: (args: unknown) => Promise<unknown>
      ): void;
    }
  ).registerTool(name, { description, inputSchema }, async () => ({
    content: [{ type: 'text' as const, text: TODO_MSG }],
  }));
}

export function registerNavigationTools(server: McpServer): void {
  registerStub(server, 'close_page', '페이지 인덱스로 탭/페이지 닫기');
  registerStub(server, 'list_pages', '열린 페이지 목록 조회');
  registerStub(server, 'navigate_page', 'URL 이동 / 뒤로·앞으로 / 새로고침');
  registerStub(server, 'new_page', '새 페이지(탭) 열기');
  registerStub(server, 'select_page', '이후 도구 호출의 컨텍스트가 될 페이지 선택');
  registerStub(server, 'wait_for', '지정 텍스트가 나올 때까지 대기');
}
