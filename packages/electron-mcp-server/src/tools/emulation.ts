/**
 * 에뮬레이션 (Emulation) — 로드맵 스텁
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

export function registerEmulationTools(server: McpServer): void {
  registerStub(
    server,
    'emulate',
    '다크/라이트 모드, CPU 스로틀, 지리 위치, 네트워크 조건, User-Agent, 뷰포트 등 에뮬레이션'
  );
  registerStub(server, 'resize_page', '페이지(창) 크기 변경');
}
