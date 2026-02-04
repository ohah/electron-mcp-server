/**
 * MCP tools: Profiler·HeapProfiler (Electron 메인 프로세스)
 * start_electron_main_cpu_profile, stop_electron_main_cpu_profile,
 * start_electron_main_heap_sampling, stop_electron_main_heap_sampling.
 * CDP Profiler / HeapProfiler 도메인을 메인(노드) 타겟에 연결해 사용.
 */

import WebSocket from 'ws';
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getMainProcessTarget, sendCdp } from './electron';

function openMainWs(): Promise<WebSocket> {
  return getMainProcessTarget().then((target) => {
    if (!target)
      throw new Error('No main process target. Run Electron with --remote-debugging-port.');
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(target.webSocketDebuggerUrl);
      ws.once('open', () => resolve(ws));
      ws.once('error', reject);
    });
  });
}

function closeWs(ws: WebSocket | null): void {
  if (ws) {
    try {
      ws.close();
    } catch {
      // ignore
    }
  }
}

/** 한 번에 하나의 CPU/힙 프로파일 세션만 지원. 동시 다중 클라이언트 시 상태 불일치 가능. */
let mainCpuProfileWs: WebSocket | null = null;
let mainHeapSamplingWs: WebSocket | null = null;

const startCpuSchema = z.object({
  samplingIntervalMicroseconds: z
    .number()
    .optional()
    .describe(
      'CPU profile sampling interval in microseconds. Omit for default. Only valid before start.'
    ),
});

const startHeapSchema = z.object({
  samplingInterval: z
    .number()
    .optional()
    .describe('Average sampling interval in bytes. Default 32768.'),
  stackDepth: z.number().optional().describe('Maximum stack depth. Default 128.'),
});

export function registerMainProfilerTools(server: McpServer): void {
  const s = server as {
    registerTool(
      name: string,
      def: { description: string; inputSchema: z.ZodTypeAny },
      handler: (args: unknown) => Promise<unknown>
    ): void;
  };

  s.registerTool(
    'start_electron_main_cpu_profile',
    {
      description:
        'Start collecting CPU profile in the Electron main process. Samples until stop_electron_main_cpu_profile is called.',
      inputSchema: startCpuSchema,
    },
    async (args: unknown) => {
      const params = startCpuSchema.parse(args ?? {});
      if (mainCpuProfileWs) {
        closeWs(mainCpuProfileWs);
        mainCpuProfileWs = null;
      }
      const ws = await openMainWs();
      mainCpuProfileWs = ws;
      const currentCpuWs = ws;
      ws.on('close', () => {
        if (mainCpuProfileWs === currentCpuWs) mainCpuProfileWs = null;
      });
      ws.on('error', () => {
        if (mainCpuProfileWs === currentCpuWs) mainCpuProfileWs = null;
      });
      try {
        if (params.samplingIntervalMicroseconds != null) {
          await sendCdp(ws, 'Profiler.setSamplingInterval', {
            interval: params.samplingIntervalMicroseconds,
          });
        }
        await sendCdp(ws, 'Profiler.enable');
        await sendCdp(ws, 'Profiler.start');
      } catch (e) {
        mainCpuProfileWs = null;
        closeWs(ws);
        throw e;
      }
      const text = JSON.stringify(
        {
          ok: true,
          message:
            'CPU profile collecting. Call stop_electron_main_cpu_profile to stop and receive the profile.',
        },
        null,
        2
      );
      return { content: [{ type: 'text' as const, text }] };
    }
  );

  s.registerTool(
    'stop_electron_main_cpu_profile',
    {
      description:
        'Stop main process CPU profile collection and return the collected Profile. Call after start_electron_main_cpu_profile.',
      inputSchema: z.object({}),
    },
    async () => {
      if (!mainCpuProfileWs) {
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(
                {
                  error: 'CPU profile not started. Call start_electron_main_cpu_profile first.',
                },
                null,
                2
              ),
            },
          ],
        };
      }
      const ws = mainCpuProfileWs;
      mainCpuProfileWs = null;
      try {
        const result = (await sendCdp(ws, 'Profiler.stop')) as { profile?: unknown };
        closeWs(ws);
        const text = JSON.stringify(result ?? {}, null, 2);
        return { content: [{ type: 'text' as const, text }] };
      } catch (e) {
        closeWs(ws);
        throw e;
      }
    }
  );

  s.registerTool(
    'start_electron_main_heap_sampling',
    {
      description:
        'Start heap sampling in the Electron main process. Call stop_electron_main_heap_sampling to get the collected SamplingHeapProfile.',
      inputSchema: startHeapSchema,
    },
    async (args: unknown) => {
      const params = startHeapSchema.parse(args ?? {});
      if (mainHeapSamplingWs) {
        closeWs(mainHeapSamplingWs);
        mainHeapSamplingWs = null;
      }
      const ws = await openMainWs();
      mainHeapSamplingWs = ws;
      const currentHeapWs = ws;
      ws.on('close', () => {
        if (mainHeapSamplingWs === currentHeapWs) mainHeapSamplingWs = null;
      });
      ws.on('error', () => {
        if (mainHeapSamplingWs === currentHeapWs) mainHeapSamplingWs = null;
      });
      try {
        await sendCdp(ws, 'HeapProfiler.enable');
        const methodParams: { samplingInterval?: number; stackDepth?: number } = {};
        if (params.samplingInterval != null)
          methodParams.samplingInterval = params.samplingInterval;
        if (params.stackDepth != null) methodParams.stackDepth = params.stackDepth;
        await sendCdp(
          ws,
          'HeapProfiler.startSampling',
          Object.keys(methodParams).length > 0 ? methodParams : undefined
        );
      } catch (e) {
        mainHeapSamplingWs = null;
        closeWs(ws);
        throw e;
      }
      const text = JSON.stringify(
        {
          ok: true,
          message:
            'Heap sampling in progress. Call stop_electron_main_heap_sampling to stop and receive the profile.',
        },
        null,
        2
      );
      return { content: [{ type: 'text' as const, text }] };
    }
  );

  s.registerTool(
    'stop_electron_main_heap_sampling',
    {
      description:
        'Stop main process heap sampling and return the collected SamplingHeapProfile. Call after start_electron_main_heap_sampling.',
      inputSchema: z.object({}),
    },
    async () => {
      if (!mainHeapSamplingWs) {
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(
                {
                  error: 'Heap sampling not started. Call start_electron_main_heap_sampling first.',
                },
                null,
                2
              ),
            },
          ],
        };
      }
      const ws = mainHeapSamplingWs;
      mainHeapSamplingWs = null;
      try {
        const result = (await sendCdp(ws, 'HeapProfiler.stopSampling')) as { profile?: unknown };
        closeWs(ws);
        const text = JSON.stringify(result ?? {}, null, 2);
        return { content: [{ type: 'text' as const, text }] };
      } catch (e) {
        closeWs(ws);
        throw e;
      }
    }
  );
}
