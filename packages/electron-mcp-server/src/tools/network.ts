/**
 * MCP tools: list_network_requests, get_network_request
 * Chrome DevTools MCP 스타일 + 메인 프로세스 네트워크 통합. targetType으로 main|renderer 구분.
 * @see https://github.com/ohah/electron-mcp-server/issues/3
 * @see https://github.com/ChromeDevTools/chrome-devtools-mcp (PageCollector/NetworkCollector)
 */

import { z } from 'zod';
import { WebSocket } from 'ws';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { findElectronTarget, sendCdp } from './electron';
import {
  fetchMainNetworkToStore,
  getMainNetworkRequest,
  getMainNetworkRequestList,
} from './network-main';

export interface NetworkRequestEntry {
  requestId: string;
  targetType: 'renderer';
  /** 수집 시각(정렬·메인과 병합용) */
  receivedTime: number;
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

function parseHeaders(
  headers?: Array<{ name: string; value: string }> | Record<string, string>
): Record<string, string> {
  if (!headers) return {};
  if (Array.isArray(headers)) {
    const out: Record<string, string> = {};
    for (const h of headers) {
      if (h?.name != null && h?.value != null) out[h.name] = h.value;
    }
    return out;
  }
  const out: Record<string, string> = {};
  for (const [name, value] of Object.entries(headers)) {
    if (value != null) out[name] = String(value);
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
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
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
  if (captureWs && captureWs.readyState === WebSocket.OPEN) {
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
  if (target.type === 'node') {
    return;
  }
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
          targetType: 'renderer',
          receivedTime: Date.now(),
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
      'Optional: wait N ms then return (include requests collected in that time). Omit to return stored list immediately.'
    ),
  includePreservedData: z
    .boolean()
    .optional()
    .describe('If true, return last 3 navigations. Default false (current nav only).'),
  targetType: z
    .enum(['all', 'main', 'renderer'])
    .optional()
    .default('all')
    .describe(
      'Filter by process: "all" (default, merge main + renderer by time), "main", "renderer".'
    ),
  includeMainProcess: z
    .boolean()
    .optional()
    .default(true)
    .describe(
      'Include main process HTTP/HTTPS requests (wrapper over http.request). Default true.'
    ),
});

async function listNetworkRequestsHandler(args: z.infer<typeof listSchema>) {
  await startCaptureIfNeeded();
  const waitMs = args?.waitMs;
  const includePreserved = args?.includePreservedData ?? false;
  const targetFilter = args?.targetType ?? 'all';
  const includeMain = args?.includeMainProcess ?? true;

  if (typeof waitMs === 'number' && waitMs > 0) {
    await new Promise((r) => setTimeout(r, waitMs));
  }

  const rendererEntries = getStoredRequests(includePreserved);
  let list: Array<{
    requestId: string;
    targetType: 'main' | 'renderer';
    url: string;
    method: string;
    responseStatus?: number;
    responseStatusText?: string;
    hasBody?: boolean;
    time?: number;
  }> = rendererEntries.map((e) => ({
    requestId: e.requestId,
    targetType: 'renderer' as const,
    url: e.url,
    method: e.method,
    responseStatus: e.responseStatus,
    responseStatusText: e.responseStatusText,
    hasBody: e.responseBody != null,
    time: e.receivedTime,
  }));

  if (includeMain && (targetFilter === 'all' || targetFilter === 'main')) {
    await fetchMainNetworkToStore();
    const mainList = getMainNetworkRequestList();
    list = list.concat(
      mainList.map((e) => ({
        requestId: e.requestId,
        targetType: 'main' as const,
        url: e.url,
        method: e.method,
        responseStatus: e.responseStatus,
        responseStatusText: e.responseStatusText,
        time: e.time,
      }))
    );
    list.sort((a, b) => (a.time ?? 0) - (b.time ?? 0));
  }

  if (targetFilter !== 'all') {
    list = list.filter((e) => e.targetType === targetFilter);
  }

  if (list.length === 0) {
    return { content: [{ type: 'text', text: '(no network requests)' }] };
  }
  const lines: string[] = [`# ${list.length} requests`];
  for (const e of list) {
    const status = e.responseStatus != null ? ` ${e.responseStatus}` : '';
    lines.push(`- [${e.targetType}] ${e.method} ${e.url}${status} id=${e.requestId}`);
  }
  return { content: [{ type: 'text', text: lines.join('\n') }] };
}

const listTool = {
  name: 'list_network_requests' as const,
  description:
    'List network requests. One line per request. Use requestId in get_network_request. Filter by targetType (main|renderer|all).',
  inputSchema: listSchema,
  handler: listNetworkRequestsHandler,
};

const getSchema = z.object({
  requestId: z.string().describe('Request ID from list_network_requests'),
});

async function getNetworkRequestHandler(args: z.infer<typeof getSchema>) {
  const requestId = args?.requestId;
  if (!requestId) {
    return {
      content: [{ type: 'text', text: 'requestId is required. Call list_network_requests first.' }],
    };
  }
  await startCaptureIfNeeded();
  const rendererEntry = byRequestId.get(requestId);
  const entry = rendererEntry ?? getMainNetworkRequest(requestId);
  if (entry) {
    const lines: string[] = [
      `${entry.method} ${entry.url}`,
      `status: ${(entry as NetworkRequestEntry).responseStatus ?? '(pending)'}`,
    ];
    const headers = (entry as NetworkRequestEntry).responseHeaders;
    if (headers) {
      // 디버깅에 유용한 헤더만 표시, 나머지는 생략
      const useful = [
        'content-type',
        'content-length',
        'cache-control',
        'etag',
        'location',
        'set-cookie',
        'x-request-id',
        'x-trace-id',
        'access-control-allow-origin',
        'access-control-allow-methods',
        'access-control-allow-headers',
        'www-authenticate',
        'retry-after',
        'x-ratelimit-remaining',
      ];
      const shown: string[] = [];
      for (const key of Object.keys(headers)) {
        if (useful.includes(key.toLowerCase())) {
          shown.push(`  ${key}: ${headers[key]}`);
        }
      }
      if (shown.length > 0) {
        lines.push('headers:');
        lines.push(...shown);
      }
    }
    if ((entry as NetworkRequestEntry).responseBody != null) {
      const body = (entry as NetworkRequestEntry).responseBody!;
      lines.push(`body (${body.length} chars):`);
      lines.push(body.length > 2000 ? body.slice(0, 2000) + '...(truncated)' : body);
    }
    return { content: [{ type: 'text', text: lines.join('\n') }] };
  }
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

const getTool = {
  name: 'get_network_request' as const,
  description: 'Get network request detail by requestId. Shows URL, status, headers, body.',
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
