/**
 * 성능 (Performance) — 로드맵 스텁
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

export function registerPerformanceTools(server: McpServer): void {
  registerStub(server, 'performance_analyze_insight', '트레이스 결과의 특정 인사이트 상세 분석');
  registerStub(server, 'performance_start_trace', '성능 트레이스 녹화 시작 (CWV 등)');
  registerStub(server, 'performance_stop_trace', '성능 트레이스 녹화 중지');
}
