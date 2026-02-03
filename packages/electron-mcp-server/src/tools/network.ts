/**
 * MCP tools: list_network_requests, get_network_request
 * Chrome DevTools MCP와 동일 스펙: 상시 수집·저장, list는 저장소 반환.
 * @see https://github.com/ohah/electron-mcp-server/issues/3
 * @see https://github.com/ChromeDevTools/chrome-devtools-mcp (PageCollector/NetworkCollector)
 */

import { z } from 'zod';
import { WebSocket } from 'ws';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { findElectronTarget, sendCdp } from './electron';

export interface NetworkRequestEntry {
  requestId: string;
  url: string;
  method: string;
  requestHeaders?: Record<string, string>;
  responseStatus?: number;
  responseStatusText?: string;
  responseHeaders?: Record<string, string>;
  responseBody?: string;
  base64Encoded?: boolean;
  loaderId?: string;
}

const MAX_NAVIGATION_SAVED = 3;

/** 레퍼런스와 동일: 페이지별 저장소, 내비게이션당 버킷(최근 3개). */
let captureWs: WebSocket | null = null;
const byRequestId = new Map<string, NetworkRequestEntry>();
/** 최신 내비게이션 먼저. navigations[0] = 현재 내비게이션 요청 목록. */
const navigationBuckets: NetworkRequestEntry[][] = [[]];
let fetchBodiesOption = true;
const bodyQueue: string[] = [];
let bodyQueueScheduled = false;

function parseHeaders(headers?: Array<{ name: string; value: string }>): Record<string, string> {
  if (!headers || !Array.isArray(headers)) return {};
  const out: Record<string, string> = {};
  for (const h of headers) {
    if (h?.name != null && h?.value != null) out[h.name] = h.value;
  }
  return out;
}

function ensureCurrentBucket(): void {
  if (navigationBuckets.length === 0) {
    navigationBuckets.push([]);
  }
}

function addToCurrentBucket(entry: NetworkRequestEntry): void {
  ensureCurrentBucket();
  navigationBuckets[0].push(entry);
}

function splitAfterNavigation(): void {
  navigationBuckets.unshift([]);
  if (navigationBuckets.length > MAX_NAVIGATION_SAVED) {
    const removed = navigationBuckets.pop();
    if (removed) {
      for (const e of removed) {
        byRequestId.delete(e.requestId);
      }
    }
  }
}

function scheduleBodyQueue(): void {
  if (bodyQueueScheduled || !captureWs || bodyQueue.length === 0) return;
  bodyQueueScheduled = true;
  setImmediate(async () => {
    bodyQueueScheduled = false;
    const ws = captureWs;
    if (!ws || ws.readyState !== ws.OPEN) return;
    while (bodyQueue.length > 0) {
      const requestId = bodyQueue.shift();
      if (!requestId) break;
      const entry = byRequestId.get(requestId);
      if (!entry) continue;
      try {
        const bodyResult = (await sendCdp(ws, 'Network.getResponseBody', {
          requestId,
        })) as { body?: string; base64Encoded?: boolean } | undefined;
        if (bodyResult?.body != null) {
          entry.responseBody = bodyResult.body;
          entry.base64Encoded = bodyResult.base64Encoded ?? false;
        }
      } catch {
        // getResponseBody can fail (redirect, no body, etc.)
      }
    }
  });
}

function clearCaptureState(): void {
  byRequestId.clear();
  navigationBuckets.length = 0;
  navigationBuckets.push([]);
  bodyQueue.length = 0;
}

async function startCaptureIfNeeded(): Promise<void> {
  if (captureWs && captureWs.readyState === captureWs.OPEN) {
    return;
  }
  if (captureWs) {
    try {
      captureWs.close();
    } catch {
      // ignore
    }
    captureWs = null;
  }
  clearCaptureState();

  const target = await findElectronTarget();
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise<void>((resolve, reject) => {
    ws.once('open', () => resolve());
    ws.once('error', reject);
  });

  const handler = (raw: Buffer) => {
    try {
      const msg = JSON.parse(raw.toString()) as {
        method?: string;
        params?: {
          requestId?: string;
          request?: { url?: string; method?: string; headers?: Record<string, string> };
          response?: {
            url?: string;
            status?: number;
            statusText?: string;
            headers?: Array<{ name: string; value: string }>;
          };
          frameId?: string;
        };
      };
      const method = msg.method;
      const params = msg.params ?? {};
      const requestId = params.requestId;

      if (method === 'Network.requestWillBeSent' && requestId) {
        const req = params.request;
        const entry: NetworkRequestEntry = {
          requestId,
          url: req?.url ?? '',
          method: req?.method ?? 'GET',
          requestHeaders: req?.headers as Record<string, string> | undefined,
          loaderId: (params as { loaderId?: string }).loaderId,
        };
        byRequestId.set(requestId, entry);
        addToCurrentBucket(entry);
      } else if (method === 'Network.responseReceived' && requestId) {
        const entry = byRequestId.get(requestId);
        if (entry) {
          const res = params.response;
          entry.responseStatus = res?.status;
          entry.responseStatusText = res?.statusText;
          entry.responseHeaders = res?.headers ? parseHeaders(res.headers) : undefined;
          if (res?.url) entry.url = res.url;
        }
      } else if (method === 'Network.loadingFinished' && requestId) {
        if (fetchBodiesOption) {
          bodyQueue.push(requestId);
          scheduleBodyQueue();
        }
      } else if (method === 'Page.frameNavigated') {
        const frame = params as { frame?: { id?: string; parentId?: string } };
        if (frame?.frame?.id && !frame.frame.parentId) {
          splitAfterNavigation();
        }
      }
    } catch {
      // ignore
    }
  };

  ws.on('message', handler);
  ws.on('close', () => {
    if (captureWs === ws) {
      captureWs = null;
      clearCaptureState();
    }
  });
  ws.on('error', () => {
    if (captureWs === ws) {
      captureWs = null;
      clearCaptureState();
    }
  });

  await sendCdp(ws, 'Network.enable');
  await sendCdp(ws, 'Page.enable');
  captureWs = ws;
}

/** 레퍼런스 getData(page, includePreservedData): 현재 내비 또는 최근 3개 내비 요청. */
function getStoredRequests(includePreservedData?: boolean): NetworkRequestEntry[] {
  if (!includePreservedData) {
    return navigationBuckets[0] ?? [];
  }
  const out: NetworkRequestEntry[] = [];
  for (let i = 0; i < MAX_NAVIGATION_SAVED && i < navigationBuckets.length; i++) {
    const bucket = navigationBuckets[i];
    if (bucket) out.push(...bucket);
  }
  return out;
}

const listSchema = z.object({
  waitMs: z
    .number()
    .optional()
    .describe(
      '선택: 추가로 N ms 대기 후 반환 (그동안 수집된 요청 포함). 생략 시 즉시 저장 목록 반환'
    ),
  includePreservedData: z
    .boolean()
    .optional()
    .describe('true면 최근 3개 내비게이션 요청 모두 반환. 기본 false(현재 내비만)'),
});

async function listNetworkRequestsHandler(args: z.infer<typeof listSchema>) {
  await startCaptureIfNeeded();
  const waitMs = args?.waitMs;
  const includePreserved = args?.includePreservedData ?? false;
  if (typeof waitMs === 'number' && waitMs > 0) {
    await new Promise((r) => setTimeout(r, waitMs));
  }
  const entries = getStoredRequests(includePreserved);
  const list = entries.map((e) => ({
    requestId: e.requestId,
    url: e.url,
    method: e.method,
    responseStatus: e.responseStatus,
    responseStatusText: e.responseStatusText,
    hasBody: e.responseBody != null,
  }));
  const text = JSON.stringify(list, null, 2);
  return { content: [{ type: 'text', text }] };
}

const listTool = {
  name: 'list_network_requests' as const,
  description:
    '현재 페이지의 네트워크 요청 목록(상시 수집). 저장된 목록을 반환. waitMs 지정 시 해당 시간 대기 후 반환. requestId는 get_network_request에서 사용.',
  inputSchema: listSchema,
  handler: listNetworkRequestsHandler,
};

const getSchema = z.object({
  requestId: z.string().describe('list_network_requests에서 반환된 요청 ID'),
});

async function getNetworkRequestHandler(args: z.infer<typeof getSchema>) {
  const requestId = args?.requestId;
  if (!requestId) {
    return {
      content: [{ type: 'text', text: 'requestId is required. Call list_network_requests first.' }],
    };
  }
  await startCaptureIfNeeded();
  const entry = byRequestId.get(requestId);
  if (!entry) {
    return {
      content: [
        {
          type: 'text',
          text:
            'Request not found: ' +
            requestId +
            '. Use a requestId from list_network_requests (capture may have started after that request).',
        },
      ],
    };
  }
  const text = JSON.stringify(entry, null, 2);
  return { content: [{ type: 'text', text }] };
}

const getTool = {
  name: 'get_network_request' as const,
  description:
    '특정 네트워크 요청 상세 조회. list_network_requests에 나온 requestId로 요청/응답 메타와 본문(수집된 경우) 반환.',
  inputSchema: getSchema,
  handler: getNetworkRequestHandler,
};

export function registerNetworkTools(server: McpServer): void {
  (
    server as {
      registerTool(
        name: string,
        def: { description: string; inputSchema: z.ZodTypeAny },
        handler: (args: unknown) => Promise<unknown>
      ): void;
    }
  ).registerTool(
    listTool.name,
    { description: listTool.description, inputSchema: listTool.inputSchema },
    (args: unknown) => listTool.handler(args as z.infer<typeof listSchema>)
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
    getTool.name,
    { description: getTool.description, inputSchema: getTool.inputSchema },
    (args: unknown) => getTool.handler(args as z.infer<typeof getSchema>)
  );
}
