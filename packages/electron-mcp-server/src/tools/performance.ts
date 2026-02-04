/**
 * 성능 (Performance) — Chrome DevTools MCP 스펙
 * performance_start_trace, performance_stop_trace, performance_analyze_insight
 * CDP Tracing 도메인 사용. 인사이트 상세 분석은 TraceEngine 미포함으로 안내만 반환.
 * @see https://github.com/ChromeDevTools/chrome-devtools-mcp (동일 스펙)
 * @see https://github.com/ohah/electron-mcp-server/issues/3
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import zlib from 'node:zlib';
import { z } from 'zod';
import { WebSocket } from 'ws';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { findElectronTarget, sendCdp, withCdpWs } from './electron';

function gzipAsync(buf: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    zlib.gzip(buf, (err, result) => {
      if (err) reject(err);
      else resolve(result ?? Buffer.alloc(0));
    });
  });
}

/** Chrome DevTools MCP / Lighthouse와 동일한 카테고리 */
const TRACE_CATEGORIES =
  '*-*,blink.console,blink.user_timing,devtools.timeline,' +
  'disabled-by-default-devtools.screenshot,' +
  'disabled-by-default-devtools.timeline,' +
  'disabled-by-default-devtools.timeline.invalidationTracking,' +
  'disabled-by-default-devtools.timeline.frame,' +
  'disabled-by-default-devtools.timeline.stack,' +
  'disabled-by-default-v8.cpu_profiler,disabled-by-default-v8.cpu_profiler.hires,' +
  'latencyInfo,loading,disabled-by-default-lighthouse,v8.execute,v8';

const RELOAD_WAIT_MS = 1500;
const AUTO_STOP_TRACE_DURATION_MS = 5_000;
const TRACING_COMPLETE_TIMEOUT_MS = 60_000;

let isTracing = false;
let lastTraceFilePath: string | null = null;
let lastTraceEventsCount = 0;

const filePathSchema = z
  .string()
  .optional()
  .describe(
    'Absolute or cwd-relative path to save trace raw data. E.g. trace.json.gz (gzip) or trace.json'
  );

const startTraceSchema = z.object({
  reload: z
    .boolean()
    .optional()
    .describe(
      'If true, automatically reload the selected page after starting trace. For another URL, navigate_page first then call this. When reload=true, the current URL is reloaded.'
    ),
  autoStop: z
    .boolean()
    .optional()
    .describe('If true, automatically stop trace recording after a short duration'),
  filePath: filePathSchema,
});

const stopTraceSchema = z.object({
  filePath: filePathSchema,
});

const analyzeInsightSchema = z.object({
  insightSetId: z
    .string()
    .describe('Insight set ID. Use only IDs from the "Available insight sets" list.'),
  insightName: z
    .string()
    .describe('Insight name for details. E.g. "DocumentLatency", "LCPBreakdown".'),
});

/** Tracing.end 호출 후 dataCollected/tracingComplete 수신해 traceEvents 배열 반환 */
function stopTracingAndCollectEvents(ws: WebSocket): Promise<unknown[]> {
  return new Promise((resolve, reject) => {
    const events: unknown[] = [];
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error('Tracing end timed out (60s)'));
    }, TRACING_COMPLETE_TIMEOUT_MS);

    const cleanup = () => {
      clearTimeout(timeout);
      ws.off('message', onMessage);
      ws.off('close', onClose);
      ws.off('error', onError);
    };

    const onMessage = (raw: Buffer) => {
      try {
        const msg = JSON.parse(raw.toString()) as {
          method?: string;
          params?: { value?: unknown[] };
        };
        if (msg.method === 'Tracing.dataCollected' && Array.isArray(msg.params?.value)) {
          events.push(...msg.params.value);
        }
        if (msg.method === 'Tracing.tracingComplete') {
          cleanup();
          resolve(events);
        }
      } catch {
        // ignore
      }
    };

    const onClose = () => {
      cleanup();
      reject(new Error('WebSocket closed before tracing complete'));
    };
    const onError = (e: Error) => {
      cleanup();
      reject(e);
    };

    ws.on('message', onMessage);
    ws.once('close', onClose);
    ws.once('error', onError);

    sendCdp(ws, 'Tracing.end').catch((err) => {
      cleanup();
      reject(err);
    });
  });
}

async function writeTraceFile(
  filePath: string,
  traceEvents: unknown[],
  gzipOutput: boolean
): Promise<string> {
  const resolved = path.isAbsolute(filePath)
    ? path.normalize(filePath)
    : path.resolve(process.cwd(), filePath);
  const json = JSON.stringify({ traceEvents });
  if (gzipOutput) {
    const buf = await gzipAsync(Buffer.from(json, 'utf-8'));
    await fs.writeFile(resolved, buf);
  } else {
    await fs.writeFile(resolved, json, 'utf-8');
  }
  return resolved;
}

export function registerPerformanceTools(server: McpServer): void {
  (
    server as {
      registerTool(
        name: string,
        def: { description: string; inputSchema: z.ZodTypeAny },
        handler: (args: unknown) => Promise<unknown>
      ): void;
    }
  ).registerTool(
    'performance_start_trace',
    {
      description:
        'Start performance trace recording on the selected page. Use for performance analysis and Core Web Vitals (CWV).',
      inputSchema: startTraceSchema,
    },
    async (args: unknown) => {
      const params = startTraceSchema.parse(args);
      if (isTracing) {
        return {
          content: [
            {
              type: 'text' as const,
              text: 'Error: A performance trace is already running. Call performance_stop_trace first. Only one trace at a time.',
            },
          ],
        };
      }
      isTracing = true;

      const target = await findElectronTarget();
      const pageUrl = target.url ?? '';

      if (params.reload && (!pageUrl || pageUrl.trim() === '' || pageUrl === 'about:blank')) {
        isTracing = false;
        return {
          content: [
            {
              type: 'text' as const,
              text: 'When using reload, navigate_page to the URL to measure first. Current page URL is empty or about:blank.',
            },
          ],
        };
      }

      if (params.autoStop) {
        // 한 연결 안에서: (reload 시 about:blank 이동) → Tracing.start → (reload 시 pageUrl 이동) → 대기 → 중지 → 이벤트 수집
        const result = await withCdpWs(target, async (ws) => {
          if (params.reload) {
            await sendCdp(ws, 'Page.enable');
            await sendCdp(ws, 'Page.navigate', { url: 'about:blank' });
            await new Promise((r) => setTimeout(r, RELOAD_WAIT_MS));
          }
          await sendCdp(ws, 'Tracing.start', { categories: TRACE_CATEGORIES });
          if (params.reload && pageUrl) {
            await sendCdp(ws, 'Page.navigate', { url: pageUrl });
          }
          await new Promise((resolve) => setTimeout(resolve, AUTO_STOP_TRACE_DURATION_MS));
          const traceEvents = await stopTracingAndCollectEvents(ws);
          return traceEvents;
        });
        isTracing = false;
        lastTraceEventsCount = result.length;
        lastTraceFilePath = null;
        if (params.filePath) {
          lastTraceFilePath = await writeTraceFile(
            params.filePath,
            result,
            params.filePath.endsWith('.gz')
          );
        }
        let text = `Performance trace stopped automatically. ${result.length} events collected.`;
        if (lastTraceFilePath) {
          text += `\nTrace data saved: ${lastTraceFilePath}`;
        }
        return { content: [{ type: 'text' as const, text }] };
      }

      try {
        await withCdpWs(target, async (ws) => {
          if (params.reload) {
            await sendCdp(ws, 'Page.enable');
            await sendCdp(ws, 'Page.navigate', { url: 'about:blank' });
            await new Promise((r) => setTimeout(r, RELOAD_WAIT_MS));
          }
          await sendCdp(ws, 'Tracing.start', { categories: TRACE_CATEGORIES });
          if (params.reload && pageUrl) {
            await sendCdp(ws, 'Page.navigate', { url: pageUrl });
          }
        });
        return {
          content: [
            {
              type: 'text' as const,
              text: 'Performance trace recording. Call performance_stop_trace to stop.',
            },
          ],
        };
      } catch (err) {
        isTracing = false;
        throw err;
      }
    }
  );

  (
    server as {
      registerTool(
        name: string,
        def: { description: string; inputSchema: z.ZodTypeAny },
        handler: (args: unknown) => Promise<unknown>
      ): void;
    }
  ).registerTool(
    'performance_stop_trace',
    {
      description: 'Stop the performance trace recording on the selected page.',
      inputSchema: stopTraceSchema,
    },
    async (args: unknown) => {
      const params = stopTraceSchema.parse(args);
      if (!isTracing) {
        return {
          content: [
            {
              type: 'text' as const,
              text: 'No performance trace running. Call performance_start_trace first.',
            },
          ],
        };
      }
      isTracing = false;

      const target = await findElectronTarget();
      const traceEvents = await withCdpWs(target, (ws) => stopTracingAndCollectEvents(ws));
      lastTraceEventsCount = traceEvents.length;

      lastTraceFilePath = null;
      if (params.filePath) {
        lastTraceFilePath = await writeTraceFile(
          params.filePath,
          traceEvents,
          params.filePath.endsWith('.gz')
        );
      }

      let text = `Performance trace stopped. ${traceEvents.length} events collected.`;
      if (lastTraceFilePath) {
        text += `\nTrace data saved: ${lastTraceFilePath}`;
      }
      text +=
        '\n\nOpen the file in Chrome DevTools Performance panel for summary and insights, or use performance_analyze_insight for a specific insight.';
      return { content: [{ type: 'text' as const, text }] };
    }
  );

  (
    server as {
      registerTool(
        name: string,
        def: { description: string; inputSchema: z.ZodTypeAny },
        handler: (args: unknown) => Promise<unknown>
      ): void;
    }
  ).registerTool(
    'performance_analyze_insight',
    {
      description:
        'Return detailed information for a specific performance insight from the trace. This server has no TraceEngine; open the trace file in Chrome DevTools Performance for full analysis.',
      inputSchema: analyzeInsightSchema,
    },
    async (args: unknown) => {
      const { insightSetId, insightName } = analyzeInsightSchema.parse(args);
      if (lastTraceEventsCount === 0 && !lastTraceFilePath) {
        return {
          content: [
            {
              type: 'text' as const,
              text: 'No trace recorded. Run performance_start_trace first, then analyze insights.',
            },
          ],
        };
      }
      const message =
        'This server does not include a trace insight engine (TraceEngine). ' +
        `Requested insight: insightSetId="${insightSetId}", insightName="${insightName}". ` +
        (lastTraceFilePath
          ? `Open the trace file in Chrome DevTools > Performance to view insights: ${lastTraceFilePath}`
          : 'Pass filePath to performance_stop_trace to save a trace file, then open it in DevTools.');
      return { content: [{ type: 'text' as const, text: message }] };
    }
  );
}
