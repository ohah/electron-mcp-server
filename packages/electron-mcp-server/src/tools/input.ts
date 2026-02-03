/**
 * 입력·자동화 (Input automation) — 로드맵 스텁
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

export function registerInputTools(server: McpServer): void {
  registerStub(server, 'click', '요소 클릭 (uid 기준)');
  registerStub(server, 'drag', '요소 드래그 앤 드롭 (from_uid → to_uid)');
  registerStub(server, 'fill', '입력/텍스트 영역에 입력, select 옵션 선택');
  registerStub(server, 'fill_form', '여러 폼 필드 한 번에 채우기');
  registerStub(server, 'handle_dialog', '브라우저 다이얼로그(alert/confirm/prompt) 처리');
  registerStub(server, 'hover', '요소 위에 마우스 호버');
  registerStub(server, 'press_key', '키/키 조합 입력 (단축키, 내비게이션 키 등)');
  registerStub(server, 'upload_file', '파일 입력 요소로 파일 업로드');
}
