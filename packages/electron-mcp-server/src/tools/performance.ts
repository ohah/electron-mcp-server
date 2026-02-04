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
    '트레이스 원시 데이터를 저장할 절대 경로 또는 cwd 기준 상대 경로. 예: trace.json.gz (압축) 또는 trace.json'
  );

const startTraceSchema = z.object({
  reload: z
    .boolean()
    .optional()
    .describe(
      '트레이스 시작 후 현재 선택된 페이지를 자동으로 다시 로드할지 여부입니다. 다른 URL을 계측하고 싶다면 먼저 navigate_page로 해당 URL로 이동한 뒤 이 도구를 호출하세요. reload=true인 경우 이동한 URL로 자동 새로고침이 수행됩니다.'
    ),
  autoStop: z.boolean().optional().describe('트레이스 녹화를 자동으로 중지할지 여부'),
  filePath: filePathSchema,
});

const stopTraceSchema = z.object({
  filePath: filePathSchema,
});

const analyzeInsightSchema = z.object({
  insightSetId: z
    .string()
    .describe('특정 인사이트 세트 ID. "Available insight sets" 목록에 있는 ID만 사용하세요.'),
  insightName: z
    .string()
    .describe('상세 정보를 얻을 인사이트 이름. 예: "DocumentLatency", "LCPBreakdown"'),
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
        '선택된 페이지에서 성능 트레이스 녹화를 시작합니다. 성능 문제와 개선 인사이트를 확인할 수 있으며, Core Web Vitals(CWV) 점수도 포함됩니다.',
      inputSchema: startTraceSchema,
    },
    async (args: unknown) => {
      const params = startTraceSchema.parse(args);
      if (isTracing) {
        return {
          content: [
            {
              type: 'text' as const,
              text: 'Error: 성능 트레이스가 이미 실행 중입니다. performance_stop_trace로 중지한 뒤 다시 시도하세요. 동시에 하나의 트레이스만 가능합니다.',
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
              text: 'reload 사용 시 먼저 navigate_page로 계측할 URL로 이동한 뒤 트레이스를 시작하세요. 현재 페이지 URL이 비어 있거나 about:blank입니다.',
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
        let text = `성능 트레이스가 자동으로 중지되었습니다. 이벤트 ${result.length}개 수집.`;
        if (lastTraceFilePath) {
          text += `\n원시 트레이스 데이터가 저장되었습니다: ${lastTraceFilePath}`;
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
              text: '성능 트레이스 녹화 중입니다. performance_stop_trace로 중지하세요.',
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
      description: '선택된 페이지에서 진행 중인 성능 트레이스 녹화를 중지합니다.',
      inputSchema: stopTraceSchema,
    },
    async (args: unknown) => {
      const params = stopTraceSchema.parse(args);
      if (!isTracing) {
        return {
          content: [
            {
              type: 'text' as const,
              text: '진행 중인 성능 트레이스가 없습니다. performance_start_trace로 먼저 시작하세요.',
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

      let text = `성능 트레이스가 중지되었습니다. 이벤트 ${traceEvents.length}개 수집.`;
      if (lastTraceFilePath) {
        text += `\n원시 트레이스 데이터가 저장되었습니다: ${lastTraceFilePath}`;
      }
      text +=
        '\n\n트레이스 요약·인사이트는 Chrome DevTools Performance 패널에서 해당 파일을 열어 확인하거나, performance_analyze_insight로 특정 인사이트를 요청할 수 있습니다.';
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
        '트레이스 녹화 결과에서 강조된 특정 성능 인사이트에 대한 상세 정보를 제공합니다.',
      inputSchema: analyzeInsightSchema,
    },
    async (args: unknown) => {
      const { insightSetId, insightName } = analyzeInsightSchema.parse(args);
      if (lastTraceEventsCount === 0 && !lastTraceFilePath) {
        return {
          content: [
            {
              type: 'text' as const,
              text: '녹화된 트레이스가 없습니다. performance_start_trace로 트레이스를 녹화한 뒤 인사이트를 분석하세요.',
            },
          ],
        };
      }
      const message =
        '이 서버에서는 인사이트 상세 분석 엔진(TraceEngine)을 포함하지 않습니다. ' +
        `요청하신 인사이트: insightSetId="${insightSetId}", insightName="${insightName}". ` +
        (lastTraceFilePath
          ? `트레이스 파일을 Chrome DevTools > Performance에서 열어 인사이트를 확인하세요: ${lastTraceFilePath}`
          : 'performance_stop_trace 호출 시 filePath를 지정하면 트레이스 파일을 저장한 뒤 DevTools에서 열 수 있습니다.');
      return { content: [{ type: 'text' as const, text: message }] };
    }
  );
}
