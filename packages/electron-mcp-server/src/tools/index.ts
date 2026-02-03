/**
 * MCP tools (chrome-devtools-mcp style).
 * Aggregates tool registration.
 * 로드맵 스텁: https://github.com/ohah/electron-mcp-server/issues/3
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerGetElectronWindowInfo } from './window-info';
import { registerSendCommandToElectron } from './command';
import { registerInputTools } from './input';
import { registerConsoleTools } from './console';
import { registerNavigationTools } from './navigation';
import { registerEmulationTools } from './emulation';
import { registerPerformanceTools } from './performance';
import { registerNetworkTools } from './network';
import { registerEvaluateScript } from './evaluate-script';
import { registerDebuggingStubTools } from './debugging-stub';
import { registerTakeSnapshot } from './snapshot';
import { registerTakeScreenshot } from './screenshot';

export function registerAllTools(server: McpServer): void {
  registerGetElectronWindowInfo(server);
  registerSendCommandToElectron(server);
  registerInputTools(server);
  registerConsoleTools(server);
  registerNavigationTools(server);
  registerEmulationTools(server);
  registerPerformanceTools(server);
  registerNetworkTools(server);
  registerEvaluateScript(server);
  registerTakeSnapshot(server);
  registerTakeScreenshot(server);
  registerDebuggingStubTools(server);
}
