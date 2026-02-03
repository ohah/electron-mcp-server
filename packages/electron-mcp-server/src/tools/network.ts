/**
 * 네트워크 (Network) — 로드맵 스텁
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

export function registerNetworkTools(server: McpServer): void {
  registerStub(server, 'get_network_request', '특정 네트워크 요청 상세 조회');
  registerStub(server, 'list_network_requests', '현재 페이지의 네트워크 요청 목록');
}
