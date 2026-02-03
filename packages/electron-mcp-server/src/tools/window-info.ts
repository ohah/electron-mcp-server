/**
 * MCP tool: get_electron_window_info
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getElectronWindowInfo } from './electron';

const schema = z.object({
  includeChildren: z.boolean().optional().describe('Include child/DevTools windows'),
});

export const getElectronWindowInfoTool = {
  name: 'get_electron_window_info' as const,
  description:
    'Get information about running Electron apps (windows). Detects apps with remote debugging on port 9222.',
  inputSchema: schema,
  handler: async (args: z.infer<typeof schema>) => {
    const result = await getElectronWindowInfo(!!args?.includeChildren);
    return {
      content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
    };
  },
};

export function registerGetElectronWindowInfo(server: McpServer): void {
  (
    server as {
      registerTool(
        name: string,
        def: { description: string; inputSchema: z.ZodTypeAny },
        handler: (args: unknown) => Promise<unknown>
      ): void;
    }
  ).registerTool(
    getElectronWindowInfoTool.name,
    {
      description: getElectronWindowInfoTool.description,
      inputSchema: getElectronWindowInfoTool.inputSchema,
    },
    (args: unknown) => getElectronWindowInfoTool.handler(args as z.infer<typeof schema>)
  );
}
