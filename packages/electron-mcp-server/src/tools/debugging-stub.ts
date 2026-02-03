/**
 * 디버깅 (Debugging) — 로드맵 스텁
 * take_snapshot 은 snapshot.ts, take_screenshot 은 screenshot.ts 에서 구현.
 * @see https://github.com/ohah/electron-mcp-server/issues/3
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

export function registerDebuggingStubTools(_server: McpServer): void {
  // evaluate_script 는 evaluate-script.ts 에서 구현
  // get_console_message, list_console_messages 는 console.ts 에서 구현
  // take_snapshot 은 snapshot.ts 에서 구현
}
