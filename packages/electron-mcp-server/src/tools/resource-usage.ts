/**
 * MCP tool: get_electron_main_resource_usage
 * Electron 메인(노드) 프로세스의 메모리·CPU 등 리소스 사용량을 반환.
 * process.memoryUsage(), process.cpuUsage(), os(선택) 실행.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { executeInElectron, getMainProcessTarget } from './electron';

const schema = z.object({
  includeOs: z
    .boolean()
    .optional()
    .default(true)
    .describe('true면 os.loadavg(), freemem(), totalmem() 포함. 기본 true.'),
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
  if (includeOs && typeof process.mainModule.require === 'function') {
    try {
      const os = process.mainModule.require('os');
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
  return JSON.stringify(out, null, 2);
})(true)
`;

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
      description:
        'Electron 메인 프로세스의 리소스 사용량을 반환합니다. memory(rss, heapUsed 등), cpu(user/system 마이크로초), pid. includeOs=true면 os.loadavg(), freemem(), totalmem() 포함.',
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
              text: JSON.stringify(
                {
                  error:
                    'No main process target. Run the Electron app with --remote-debugging-port.',
                },
                null,
                2
              ),
            },
          ],
        };
      }
      const script = params.includeOs
        ? RESOURCE_SCRIPT
        : RESOURCE_SCRIPT.replace('})(true)', '})(false)');
      const text = await executeInElectron(script, mainTarget);
      return { content: [{ type: 'text' as const, text }] };
    }
  );
}
