/**
 * MCP tool: get_electron_process_structure
 * Electron 앱의 메인(1) + 렌더러(여러) 구조를 한 번에 반환.
 * 사전 인지: 어디서 무엇이 가능한지(capabilities). 동시 감시: main + renderers 한 호출로.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getElectronProcessStructure, setSelectedPort } from './electron';

const schema = z.object({
  includeDevTools: z
    .boolean()
    .optional()
    .describe('If true, include DevTools windows in renderers'),
});

export const getElectronProcessStructureTool = {
  name: 'get_electron_process_structure' as const,
  description:
    'Returns the process structure of the Electron app: main process (1) and renderers (multiple), with capabilities for each. Use select_page to pick a page id, then use evaluate_script and other tools.',
  inputSchema: schema,
  handler: async (args: z.infer<typeof schema>) => {
    const result = await getElectronProcessStructure(!!args?.includeDevTools);
    return {
      content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
    };
  },
};

export function registerGetElectronProcessStructure(server: McpServer): void {
  (
    server as {
      registerTool(
        name: string,
        def: { description: string; inputSchema: z.ZodTypeAny },
        handler: (args: unknown) => Promise<unknown>
      ): void;
    }
  ).registerTool(
    getElectronProcessStructureTool.name,
    {
      description: getElectronProcessStructureTool.description,
      inputSchema: getElectronProcessStructureTool.inputSchema,
    },
    (args: unknown) => getElectronProcessStructureTool.handler(args as z.infer<typeof schema>)
  );

  const selectPortSchema = z.object({
    port: z
      .number()
      .describe(
        'Debugging port of the Electron app to use (e.g. 9222, 9229, 9230). Pass 0 to clear selection (use first discovered app).'
      ),
  });
  (
    server as {
      registerTool(
        name: string,
        def: { description: string; inputSchema: z.ZodTypeAny },
        handler: (args: unknown) => Promise<unknown>
      ): void;
    }
  ).registerTool(
    'select_port',
    {
      description:
        'Select which Electron app port to use when multiple are connected (e.g. 9229, 9230). Get port from get_electron_process_structure apps. Pass 0 to clear (use first discovered app).',
      inputSchema: selectPortSchema,
    },
    async (args: unknown) => {
      const { port } = selectPortSchema.parse(args ?? {});
      setSelectedPort(port === 0 ? null : port);
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({ ok: true, selectedPort: port === 0 ? null : port }, null, 2),
          },
        ],
      };
    }
  );
}
