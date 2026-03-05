/**
 * MCP tool: get_electron_main_resource_usage — compact text 출력.
 * JSON 대신 한눈에 볼 수 있는 텍스트 포맷.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { executeInElectron, getMainProcessTarget } from './electron';
import { formatBytes } from './ref-store';

const schema = z.object({
  includeOs: z
    .boolean()
    .optional()
    .default(true)
    .describe('Include OS stats (loadavg, freemem, totalmem). Default true.'),
});

const RESOURCE_SCRIPT = `
(function(includeOs) {
  const mem = process.memoryUsage();
  const cpu = process.cpuUsage();
  const out = {
    memory: {
      rss: mem.rss,
      heapTotal: mem.heapTotal,
      heapUsed: mem.heapUsed,
      external: mem.external,
      arrayBuffers: mem.arrayBuffers != null ? mem.arrayBuffers : undefined
    },
    cpu: { user: cpu.user, system: cpu.system },
    pid: process.pid
  };
  if (includeOs && typeof require !== 'undefined') {
    try {
      const os = require('os');
      out.os = {
        loadavg: os.loadavg(),
        freemem: os.freemem(),
        totalmem: os.totalmem(),
        platform: os.platform()
      };
    } catch (e) {
      out.os = { error: e.message };
    }
  }
  return JSON.stringify(out);
})(INCLUDE_OS)
`;

interface ResourceData {
  memory: {
    rss: number;
    heapTotal: number;
    heapUsed: number;
    external: number;
    arrayBuffers?: number;
  };
  cpu: { user: number; system: number };
  pid: number;
  os?: {
    loadavg?: number[];
    freemem?: number;
    totalmem?: number;
    platform?: string;
    error?: string;
  };
}

function formatResourceUsage(data: ResourceData): string {
  const lines: string[] = [
    `# Main Process (pid=${data.pid})`,
    '',
    '## Memory',
    `  rss:          ${formatBytes(data.memory.rss)}`,
    `  heap used:    ${formatBytes(data.memory.heapUsed)} / ${formatBytes(data.memory.heapTotal)}`,
    `  external:     ${formatBytes(data.memory.external)}`,
  ];
  if (data.memory.arrayBuffers != null) {
    lines.push(`  arrayBuffers: ${formatBytes(data.memory.arrayBuffers)}`);
  }
  lines.push(
    '',
    '## CPU (cumulative)',
    `  user:   ${(data.cpu.user / 1000).toFixed(1)}ms`,
    `  system: ${(data.cpu.system / 1000).toFixed(1)}ms`
  );
  if (data.os && !data.os.error) {
    lines.push(
      '',
      `## OS (${data.os.platform})`,
      `  load avg: ${data.os.loadavg?.map((v) => v.toFixed(2)).join(', ')}`,
      `  memory:   ${formatBytes(data.os.freemem!)} free / ${formatBytes(data.os.totalmem!)} total`
    );
  }
  return lines.join('\n');
}

export function registerResourceUsageTool(server: McpServer): void {
  (
    server as {
      registerTool(
        name: string,
        def: { description: string; inputSchema: z.ZodTypeAny },
        handler: (args: unknown) => Promise<unknown>
      ): void;
    }
  ).registerTool(
    'get_electron_main_resource_usage',
    {
      description: 'Main process resource usage: memory, CPU, OS stats. Compact text output.',
      inputSchema: schema,
    },
    async (args: unknown) => {
      const params = schema.parse(args ?? {});
      const mainTarget = await getMainProcessTarget();
      if (!mainTarget) {
        return {
          content: [
            {
              type: 'text' as const,
              text: 'No main process. Run Electron with --remote-debugging-port.',
            },
          ],
        };
      }
      const script = RESOURCE_SCRIPT.replace('INCLUDE_OS', String(params.includeOs));
      const raw = await executeInElectron(script, mainTarget);
      try {
        const data = JSON.parse(raw) as ResourceData;
        return { content: [{ type: 'text' as const, text: formatResourceUsage(data) }] };
      } catch {
        return { content: [{ type: 'text' as const, text: raw }] };
      }
    }
  );
}
