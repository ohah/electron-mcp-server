/**
 * MCP tool: get_electron_window_info — compact text 출력.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getElectronWindowInfo } from './electron';

const schema = z.object({
  includeChildren: z.boolean().optional().describe('Include child/DevTools windows'),
});

interface WindowInfoResult {
  windows: Array<{ id: string; title: string; url: string; type: string }>;
  totalTargets: number;
  automationReady: boolean;
}

function formatWindowInfo(result: WindowInfoResult): string {
  const lines: string[] = [
    `# Electron Windows (${result.windows.length} windows, ${result.totalTargets} targets)`,
    `automation: ${result.automationReady ? 'ready' : 'not ready'}`,
  ];
  for (const w of result.windows) {
    lines.push(`- [${w.type}] "${w.title || w.url || 'untitled'}"`);
    if (w.url) lines.push(`  url: ${w.url}`);
  }
  if (result.windows.length === 0) {
    lines.push('(no windows found)');
  }
  return lines.join('\n');
}

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
    'get_electron_window_info',
    {
      description: 'Electron app windows overview. Compact text output.',
      inputSchema: schema,
    },
    async (args: unknown) => {
      const params = schema.parse(args ?? {});
      const result = await getElectronWindowInfo(!!params.includeChildren) as WindowInfoResult;
      return { content: [{ type: 'text' as const, text: formatWindowInfo(result) }] };
    }
  );
}
