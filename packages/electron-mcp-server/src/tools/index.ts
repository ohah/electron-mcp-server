/**
 * MCP tools (chrome-devtools-mcp style).
 * Aggregates tool registration.
 * 로드맵 스텁: https://github.com/ohah/electron-mcp-server/issues/3
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerGetElectronWindowInfo } from './window-info';
import { registerTakeScreenshot } from './screenshot';
import { registerSendCommandToElectron } from './command';
import { registerInputTools } from './input';
import { registerNavigationTools } from './navigation';
import { registerEmulationTools } from './emulation';
import { registerPerformanceTools } from './performance';
import { registerNetworkTools } from './network';
import { registerDebuggingStubTools } from './debugging-stub';

export function registerAllTools(server: McpServer): void {
  registerGetElectronWindowInfo(server);
  registerTakeScreenshot(server);
  registerSendCommandToElectron(server);
  registerInputTools(server);
  registerNavigationTools(server);
  registerEmulationTools(server);
  registerPerformanceTools(server);
  registerNetworkTools(server);
  registerDebuggingStubTools(server);
}
