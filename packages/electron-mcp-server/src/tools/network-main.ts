/**
 * MCP tools: list_electron_main_network_requests, get_electron_main_network_request
 * 메인 프로세스 HTTP/HTTPS 감지: http.request / https.request 래핑, 앱 버퍼 → list 호출 시 서버로 가져와 저장 후 앱 버퍼 비우기.
 * @see packages/electron-mcp-server/docs/electron-main-process.md
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { executeInElectron, getMainProcessTarget } from './electron';

export interface MainNetworkRequestEntry {
  requestId: string;
  method: string;
  url: string;
  requestHeaders?: Record<string, string>;
  responseStatus?: number;
  responseStatusText?: string;
  time: number;
}

const INSTALL_SCRIPT = `
(function(){
  if (typeof global.__httpMonitorBuffer !== 'undefined') return 'already installed';
  try {
    global.__httpMonitorNextId = 0;
    global.__httpMonitorBuffer = [];

    function wrapRequest(orig, protocol) {
      return function(options, callback) {
        global.__httpMonitorNextId = (global.__httpMonitorNextId || 0) + 1;
        var reqId = protocol + '-' + global.__httpMonitorNextId;
        var opts = typeof options === 'string' ? require('url').parse(options) : (options || {});
        var url = opts.href || (opts.protocol || 'http:') + '//' + (opts.hostname || opts.host || '') + (opts.path || opts.pathname || '/');
        var method = (opts.method || 'GET').toUpperCase();
        var entry = { requestId: reqId, method: method, url: url, time: Date.now(), requestHeaders: opts.headers || {} };
        global.__httpMonitorBuffer.push(entry);

        var req = orig.apply(this, arguments);
        req.on('response', function(res) {
          entry.responseStatus = res.statusCode;
          entry.responseStatusText = res.statusMessage;
        });
        return req;
      };
    }

    var http = require('http');
    var https = require('https');
    http.request = wrapRequest(http.request.bind(http), 'http');
    https.request = wrapRequest(https.request.bind(https), 'https');
    return 'installed';
  } catch (e) {
    return 'error: ' + (e && e.message ? e.message : String(e));
  }
})();
`;

const GET_BUFFER_SCRIPT = `
(function(){
  try {
    return JSON.stringify(global.__httpMonitorBuffer || []);
  } catch (e) {
    return JSON.stringify({ error: e && e.message ? e.message : String(e) });
  }
})();
`;

const CLEAR_BUFFER_SCRIPT = `
(function(){
  if (global.__httpMonitorBuffer) global.__httpMonitorBuffer.length = 0;
  return 'ok';
})();
`;

const byRequestId = new Map<string, MainNetworkRequestEntry>();
const orderList: string[] = [];

async function ensureInstalled(
  mainTarget: Awaited<ReturnType<typeof getMainProcessTarget>>
): Promise<string | null> {
  if (!mainTarget) return null;
  const result = await executeInElectron(INSTALL_SCRIPT, mainTarget);
  return result && result.includes('installed') ? result : null;
}

async function fetchAndClearBuffer(
  mainTarget: Awaited<ReturnType<typeof getMainProcessTarget>>
): Promise<void> {
  if (!mainTarget) return;
  const raw = await executeInElectron(GET_BUFFER_SCRIPT, mainTarget);
  try {
    const arr = JSON.parse(raw) as Array<{
      requestId: string;
      method: string;
      url: string;
      time: number;
      requestHeaders?: Record<string, string>;
      responseStatus?: number;
      responseStatusText?: string;
    }>;
    if (Array.isArray(arr)) {
      for (const item of arr) {
        const rid = item.requestId || 'main-?' + orderList.length;
        const entry: MainNetworkRequestEntry = {
          requestId: rid,
          method: item.method ?? 'GET',
          url: item.url ?? '',
          time: typeof item.time === 'number' ? item.time : Date.now(),
          requestHeaders: item.requestHeaders,
          responseStatus: item.responseStatus,
          responseStatusText: item.responseStatusText,
        };
        byRequestId.set(rid, entry);
        if (!orderList.includes(rid)) orderList.push(rid);
      }
    }
  } catch {
    // ignore
  }
  await executeInElectron(CLEAR_BUFFER_SCRIPT, mainTarget);
}

const listSchema = z.object({
  pageIdx: z.number().optional().describe('Page number (0-based). Omit for first page.'),
  pageSize: z.number().optional().describe('Max requests to return. Omit for all.'),
});

const getSchema = z.object({
  requestId: z.string().describe('Request ID from list_electron_main_network_requests.'),
});

async function listMainNetworkRequestsHandler(args: unknown) {
  const params = listSchema.parse(args ?? {});
  const mainTarget = await getMainProcessTarget();
  if (!mainTarget) {
    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(
            { error: 'No main process target. Run the Electron app with --remote-debugging-port.' },
            null,
            2
          ),
        },
      ],
    };
  }
  const installResult = await ensureInstalled(mainTarget);
  if (!installResult) {
    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(
            { error: 'Failed to install main network monitor in main process.' },
            null,
            2
          ),
        },
      ],
    };
  }
  await fetchAndClearBuffer(mainTarget);
  const pageIdx = params.pageIdx ?? 0;
  const pageSize = params.pageSize;
  const slice =
    pageSize != null && pageSize > 0
      ? orderList.slice(pageIdx * pageSize, (pageIdx + 1) * pageSize)
      : orderList;
  const list = slice.map((rid) => {
    const e = byRequestId.get(rid);
    return e
      ? {
          requestId: e.requestId,
          url: e.url,
          method: e.method,
          responseStatus: e.responseStatus,
          time: e.time,
        }
      : { requestId: rid };
  });
  const text = JSON.stringify(list, null, 2);
  return { content: [{ type: 'text' as const, text }] };
}

async function getMainNetworkRequestHandler(args: unknown) {
  const params = getSchema.parse(args);
  const entry = byRequestId.get(params.requestId);
  if (!entry) {
    return {
      content: [
        {
          type: 'text' as const,
          text: `Request not found: ${params.requestId}. Use requestId from list_electron_main_network_requests.`,
        },
      ],
    };
  }
  const text = JSON.stringify(entry, null, 2);
  return { content: [{ type: 'text' as const, text }] };
}

export function registerNetworkMainTools(server: McpServer): void {
  const s = server as {
    registerTool(
      name: string,
      def: { description: string; inputSchema: z.ZodTypeAny },
      handler: (args: unknown) => Promise<unknown>
    ): void;
  };

  s.registerTool(
    'list_electron_main_network_requests',
    {
      description:
        'List HTTP/HTTPS requests made from the Electron main process. Installs a minimal wrapper over http.request/https.request if needed, then fetches app buffer into server storage and clears the app buffer. Call repeatedly to see new requests.',
      inputSchema: listSchema,
    },
    listMainNetworkRequestsHandler
  );

  s.registerTool(
    'get_electron_main_network_request',
    {
      description:
        'Get a single main-process network request by requestId from list_electron_main_network_requests.',
      inputSchema: getSchema,
    },
    getMainNetworkRequestHandler
  );
}
