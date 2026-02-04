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

let mainCpuProfileWs: WebSocket | null = null;
let mainHeapSamplingWs: WebSocket | null = null;

const startCpuSchema = z.object({
  samplingIntervalMicroseconds: z
    .number()
    .optional()
    .describe('CPU 프로파일 샘플 간격(마이크로초). 생략 시 기본값. start 전에만 유효.'),
});

const startHeapSchema = z.object({
  samplingInterval: z.number().optional().describe('평균 샘플 간격(바이트). 기본 32768.'),
  stackDepth: z.number().optional().describe('최대 스택 깊이. 기본 128.'),
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
        'Electron 메인 프로세스에서 CPU 프로파일 수집을 시작합니다. stop_electron_main_cpu_profile 호출 시까지 샘플을 수집합니다.',
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
            'CPU 프로파일 수집 중. stop_electron_main_cpu_profile으로 중지 후 프로파일을 받으세요.',
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
        '메인 프로세스 CPU 프로파일 수집을 중지하고 수집된 프로파일(Profile)을 반환합니다. start_electron_main_cpu_profile 호출 후 사용.',
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
                  error:
                    'CPU 프로파일이 시작되지 않았습니다. start_electron_main_cpu_profile을 먼저 호출하세요.',
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
        'Electron 메인 프로세스에서 힙 샘플링을 시작합니다. stop_electron_main_heap_sampling 호출 시 수집된 샘플링 프로파일을 반환합니다.',
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
            '힙 샘플링 중. stop_electron_main_heap_sampling으로 중지 후 프로파일을 받으세요.',
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
        '메인 프로세스 힙 샘플링을 중지하고 수집된 SamplingHeapProfile을 반환합니다. start_electron_main_heap_sampling 호출 후 사용.',
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
                  error:
                    '힙 샘플링이 시작되지 않았습니다. start_electron_main_heap_sampling을 먼저 호출하세요.',
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
