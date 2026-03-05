/**
 * MCP tool: get_electron_process_structure — compact tree + ref 기반.
 * agent-browser 스타일 출력: 프로세스 트리를 compact text로, 각 프로세스에 [ref=p1] 부여.
 * ref로 select_page, evaluate_script 등에서 참조 가능.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getElectronProcessStructure, setSelectedPort } from './electron';
import { resetProcessRefs, addProcessRef } from './ref-store';

const schema = z.object({
  includeDevTools: z
    .boolean()
    .optional()
    .describe('Include DevTools windows in renderers'),
});

interface ProcessStructureResult {
  main: { id: string; title: string; url: string; webSocketDebuggerUrl: string; type: string } | null;
  renderers: Array<{ id: string; title: string; url: string; webSocketDebuggerUrl?: string; type: string }>;
  capabilities: { main: string[]; renderers: string[] };
  apps: Array<{ port: number; targetCount: number }>;
}

function formatProcessTree(result: ProcessStructureResult): string {
  resetProcessRefs();
  const lines: string[] = [];

  if (result.apps.length > 1) {
    lines.push(`# ${result.apps.length} apps connected`);
    for (const app of result.apps) {
      lines.push(`  port=${app.port} targets=${app.targetCount}`);
    }
    lines.push('');
  }

  if (result.main) {
    const ref = addProcessRef({
      type: 'main',
      targetId: result.main.id,
      webSocketDebuggerUrl: result.main.webSocketDebuggerUrl,
    });
    lines.push(`- main [ref=${ref}] "${result.main.title || 'Electron Main'}"`);
    if (result.capabilities.main.length > 0) {
      lines.push(`  capabilities: ${result.capabilities.main.join(', ')}`);
    }
  } else {
    lines.push('- main (not found)');
  }

  for (const r of result.renderers) {
    const ref = addProcessRef({
      type: 'renderer',
      targetId: r.id,
      webSocketDebuggerUrl: r.webSocketDebuggerUrl,
    });
    const title = r.title || r.url || 'untitled';
    lines.push(`  - renderer [ref=${ref}] "${title}"`);
    if (r.url) lines.push(`    url: ${r.url}`);
  }

  if (result.renderers.length === 0) {
    lines.push('  (no renderers)');
  }

  if (result.capabilities.renderers.length > 0) {
    lines.push(`  renderer capabilities: ${result.capabilities.renderers.join(', ')}`);
  }

  return lines.join('\n');
}

export function registerGetElectronProcessStructure(server: McpServer): void {
  const s = server as {
    registerTool(
      name: string,
      def: { description: string; inputSchema: z.ZodTypeAny },
      handler: (args: unknown) => Promise<unknown>
    ): void;
  };

  s.registerTool(
    'get_electron_process_structure',
    {
      description:
        'Electron app process tree: main + renderers with refs. Use @ref with select_page. Compact output.',
      inputSchema: schema,
    },
    async (args: unknown) => {
      const params = schema.parse(args ?? {});
      const result = await getElectronProcessStructure(!!params.includeDevTools) as ProcessStructureResult;
      const text = formatProcessTree(result);
      return { content: [{ type: 'text' as const, text }] };
    }
  );

  const selectPortSchema = z.object({
    port: z.number().describe('Debugging port (e.g. 9222). Pass 0 to clear.'),
  });

  s.registerTool(
    'select_port',
    {
      description: 'Select which Electron app port when multiple are connected. Pass 0 to clear.',
      inputSchema: selectPortSchema,
    },
    async (args: unknown) => {
      const { port } = selectPortSchema.parse(args ?? {});
      setSelectedPort(port === 0 ? null : port);
      return {
        content: [{ type: 'text' as const, text: `Port set to ${port === 0 ? 'auto' : port}` }],
      };
    }
  );
}
