/**
 * 디버깅 (Debugging) — 로드맵 스텁
 * take_screenshot 은 이미 구현됨(screenshot.ts). 나머지만 스텁.
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

export function registerDebuggingStubTools(server: McpServer): void {
  registerStub(server, 'evaluate_script', '페이지 컨텍스트에서 JavaScript 실행');
  registerStub(server, 'get_console_message', '콘솔 메시지 ID로 단건 조회');
  registerStub(server, 'list_console_messages', '콘솔 메시지 목록');
  registerStub(server, 'take_snapshot', 'a11y 트리 기반 페이지 텍스트 스냅샷(uid 부여)');
}
