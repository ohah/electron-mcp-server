/**
 * 디버깅 (Debugging) — 로드맵 스텁
 * take_snapshot 등 스텁 등록. (take_screenshot 제거됨)
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
  // evaluate_script 는 evaluate-script.ts 에서 구현
  // get_console_message, list_console_messages 는 console.ts 에서 구현
  registerStub(server, 'take_snapshot', 'a11y 트리 기반 페이지 텍스트 스냅샷(uid 부여)');
}
