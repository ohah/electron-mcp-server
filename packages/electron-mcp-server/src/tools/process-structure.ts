/**
 * MCP tool: get_electron_process_structure
 * Electron 앱의 메인(1) + 렌더러(여러) 구조를 한 번에 반환.
 * 사전 인지: 어디서 무엇이 가능한지(capabilities). 동시 감시: main + renderers 한 호출로.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getElectronProcessStructure } from './electron';

const schema = z.object({
  includeDevTools: z.boolean().optional().describe('true면 DevTools 창도 renderers에 포함'),
});

export const getElectronProcessStructureTool = {
  name: 'get_electron_process_structure' as const,
  description:
    'Electron 앱의 프로세스 구조를 반환합니다. 메인 프로세스(1개)와 렌더러(여러 개)를 구분하고, 각각에서 가능한 작업(capabilities)을 안내합니다. 한 번의 호출로 메인·렌더러를 동시에 파악할 수 있습니다. select_page로 id를 선택한 뒤 evaluate_script 등 도구를 사용하세요.',
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
}
