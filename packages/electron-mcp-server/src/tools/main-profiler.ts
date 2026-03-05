/**
 * MCP tools: Profiler·HeapProfiler (Electron 메인 프로세스)
 * Compact text 출력 스타일.
 */

import WebSocket from 'ws';
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getMainProcessTarget, sendCdp } from './electron';

function openMainWs(): Promise<WebSocket> {
  return getMainProcessTarget().then((target) => {
    if (!target)
      throw new Error('No main process. Run Electron with --remote-debugging-port.');
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(target.webSocketDebuggerUrl);
      ws.once('open', () => resolve(ws));
      ws.once('error', reject);
    });
  });
}

function closeWs(ws: WebSocket | null): void {
  if (ws) { try { ws.close(); } catch { /* ignore */ } }
}

let mainCpuProfileWs: WebSocket | null = null;
let mainHeapSamplingWs: WebSocket | null = null;

const startCpuSchema = z.object({
  samplingIntervalMicroseconds: z.number().optional().describe('Sampling interval in µs'),
});

const startHeapSchema = z.object({
  samplingInterval: z.number().optional().describe('Average sampling interval in bytes. Default 32768.'),
  stackDepth: z.number().optional().describe('Maximum stack depth. Default 128.'),
});

export function registerMainProfilerTools(server: McpServer): void {
  const s = server as {
    registerTool(name: string, def: { description: string; inputSchema: z.ZodTypeAny }, handler: (args: unknown) => Promise<unknown>): void;
  };

  s.registerTool(
    'start_electron_main_cpu_profile',
    { description: 'Start CPU profiling in main process. Call stop to get results.', inputSchema: startCpuSchema },
    async (args: unknown) => {
      const params = startCpuSchema.parse(args ?? {});
      if (mainCpuProfileWs) { closeWs(mainCpuProfileWs); mainCpuProfileWs = null; }
      const ws = await openMainWs();
      mainCpuProfileWs = ws;
      const currentCpuWs = ws;
      ws.on('close', () => { if (mainCpuProfileWs === currentCpuWs) mainCpuProfileWs = null; });
      ws.on('error', () => { if (mainCpuProfileWs === currentCpuWs) mainCpuProfileWs = null; });
      try {
        if (params.samplingIntervalMicroseconds != null) {
          await sendCdp(ws, 'Profiler.setSamplingInterval', { interval: params.samplingIntervalMicroseconds });
        }
        await sendCdp(ws, 'Profiler.enable');
        await sendCdp(ws, 'Profiler.start');
      } catch (e) {
        mainCpuProfileWs = null;
        closeWs(ws);
        throw e;
      }
      return { content: [{ type: 'text' as const, text: 'CPU profiling started. Call stop_electron_main_cpu_profile to collect.' }] };
    }
  );

  s.registerTool(
    'stop_electron_main_cpu_profile',
    { description: 'Stop CPU profiling and return profile data.', inputSchema: z.object({}) },
    async () => {
      if (!mainCpuProfileWs) {
        return { content: [{ type: 'text' as const, text: 'Not started. Call start_electron_main_cpu_profile first.' }] };
      }
      const ws = mainCpuProfileWs;
      mainCpuProfileWs = null;
      try {
        const result = (await sendCdp(ws, 'Profiler.stop')) as { profile?: { nodes?: unknown[]; startTime?: number; endTime?: number } };
        closeWs(ws);
        const profile = result?.profile;
        if (profile) {
          const duration = profile.endTime && profile.startTime
            ? ((profile.endTime - profile.startTime) / 1000000).toFixed(2)
            : '?';
          const nodeCount = profile.nodes ? profile.nodes.length : 0;
          const summary = `CPU profile collected: ${duration}s, ${nodeCount} nodes`;
          return { content: [
            { type: 'text' as const, text: summary },
            { type: 'text' as const, text: JSON.stringify(result, null, 2) },
          ] };
        }
        return { content: [{ type: 'text' as const, text: JSON.stringify(result ?? {}, null, 2) }] };
      } catch (e) {
        closeWs(ws);
        throw e;
      }
    }
  );

  s.registerTool(
    'start_electron_main_heap_sampling',
    { description: 'Start heap sampling in main process.', inputSchema: startHeapSchema },
    async (args: unknown) => {
      const params = startHeapSchema.parse(args ?? {});
      if (mainHeapSamplingWs) { closeWs(mainHeapSamplingWs); mainHeapSamplingWs = null; }
      const ws = await openMainWs();
      mainHeapSamplingWs = ws;
      const currentHeapWs = ws;
      ws.on('close', () => { if (mainHeapSamplingWs === currentHeapWs) mainHeapSamplingWs = null; });
      ws.on('error', () => { if (mainHeapSamplingWs === currentHeapWs) mainHeapSamplingWs = null; });
      try {
        await sendCdp(ws, 'HeapProfiler.enable');
        const methodParams: { samplingInterval?: number; stackDepth?: number } = {};
        if (params.samplingInterval != null) methodParams.samplingInterval = params.samplingInterval;
        if (params.stackDepth != null) methodParams.stackDepth = params.stackDepth;
        await sendCdp(ws, 'HeapProfiler.startSampling',
          Object.keys(methodParams).length > 0 ? methodParams : undefined);
      } catch (e) {
        mainHeapSamplingWs = null;
        closeWs(ws);
        throw e;
      }
      return { content: [{ type: 'text' as const, text: 'Heap sampling started. Call stop_electron_main_heap_sampling to collect.' }] };
    }
  );

  s.registerTool(
    'stop_electron_main_heap_sampling',
    { description: 'Stop heap sampling and return profile.', inputSchema: z.object({}) },
    async () => {
      if (!mainHeapSamplingWs) {
        return { content: [{ type: 'text' as const, text: 'Not started. Call start_electron_main_heap_sampling first.' }] };
      }
      const ws = mainHeapSamplingWs;
      mainHeapSamplingWs = null;
      try {
        const result = (await sendCdp(ws, 'HeapProfiler.stopSampling')) as { profile?: unknown };
        closeWs(ws);
        return { content: [{ type: 'text' as const, text: JSON.stringify(result ?? {}, null, 2) }] };
      } catch (e) {
        closeWs(ws);
        throw e;
      }
    }
  );
}
