/**
 * Node-only MCP server (no Electron in this process).
 * Connects to Electron apps via CDP (--remote-debugging-port=9222).
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { registerAllTools } from './tools';

async function main() {
  const server = new McpServer({
    name: 'electron-mcp-server',
    version: '1.0.0',
  });

  registerAllTools(server);

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(
    '[electron-mcp-server] Running on stdio (Node). Use Electron with --remote-debugging-port=9222'
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
