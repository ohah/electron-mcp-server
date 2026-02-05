/**
 * 메인 프로세스 HTTP/HTTPS 감지: http.request / https.request 래핑, 앱 버퍼 → fetch 시 서버로 가져와 저장 후 앱 버퍼 비우기.
 * list_network_requests / get_network_request (network.ts)에서 통합 사용.
 * @see packages/electron-mcp-server/docs/electron-main-process.md
 */

import { executeInElectron, getMainProcessTarget } from './electron';

export interface MainNetworkRequestEntry {
  requestId: string;
  targetType: 'main';
  method: string;
  url: string;
  requestHeaders?: Record<string, string>;
  responseStatus?: number;
  responseStatusText?: string;
  time: number;
}

// CDP eval 간 동일 require 캐시에 패치가 보이려면 동기 패치 필요. setImmediate 사용 시
// 이후 eval에서 require('https')가 패치된 모듈을 보지 못해 캡처되지 않음.
const INSTALL_SCRIPT = `
(function(){
  if (typeof global.__httpMonitorBuffer !== 'undefined') return Promise.resolve('already installed');
  global.__httpMonitorBuffer = [];
  global.__httpMonitorNextId = 0;
  try {
    function wrapRequest(orig, protocol) {
      return function(options, callback) {
        global.__httpMonitorNextId = (global.__httpMonitorNextId || 0) + 1;
        var reqId = protocol + '-' + global.__httpMonitorNextId;
        var opts = typeof options === 'string' ? require('url').parse(options) : (options || {});
        var url = opts.href || (opts.protocol || (protocol + ':')) + '//' + (opts.hostname || opts.host || '') + (opts.path || opts.pathname || '/');
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
    var wrapHttp = wrapRequest(http.request.bind(http), 'http');
    var wrapHttps = wrapRequest(https.request.bind(https), 'https');
    http.request = wrapHttp;
    https.request = wrapHttps;
    http.get = function(input, options, cb) {
      var req = http.request(input, options, cb);
      if (req) req.end();
      return req;
    };
    https.get = function(input, options, cb) {
      var req = https.request(input, options, cb);
      if (req) req.end();
      return req;
    };
    return Promise.resolve('installed');
  } catch (e) {
    return Promise.resolve('error: ' + (e && e.message ? e.message : String(e)));
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

/** 콘솔/렌더러 네트워크와 동일하게 서버 저장 개수 상한. 장기 실행 시 메모리 완화. */
const MAX_MAIN_NETWORK_SAVED = 500;

const byRequestId = new Map<string, MainNetworkRequestEntry>();
const orderList: string[] = [];

async function ensureInstalled(
  mainTarget: Awaited<ReturnType<typeof getMainProcessTarget>>
): Promise<string | null> {
  if (!mainTarget) return null;
  const result = await executeInElectron(INSTALL_SCRIPT, mainTarget);
  return result && result.includes('installed') ? result : null;
}

let fetchAndClearMutex: Promise<void> = Promise.resolve();

async function fetchAndClearBuffer(
  mainTarget: Awaited<ReturnType<typeof getMainProcessTarget>>
): Promise<void> {
  if (!mainTarget) return;
  const next = fetchAndClearMutex.then(async () => {
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
            targetType: 'main',
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
      while (orderList.length > MAX_MAIN_NETWORK_SAVED) {
        const oldest = orderList.shift();
        if (oldest) byRequestId.delete(oldest);
      }
    } catch {
      // ignore
    }
    await executeInElectron(CLEAR_BUFFER_SCRIPT, mainTarget);
  });
  fetchAndClearMutex = next;
  await next;
}

/** 메인 프로세스 버퍼를 서버 저장소로 가져오고 앱 버퍼 비우기. list_network_requests에서 호출. */
export async function fetchMainNetworkToStore(): Promise<void> {
  const mainTarget = await getMainProcessTarget();
  if (!mainTarget) return;
  const installResult = await ensureInstalled(mainTarget);
  if (!installResult) return;
  await fetchAndClearBuffer(mainTarget);
}

/** 메인 저장소에서 requestId로 한 건 조회. 없으면 null. */
export function getMainNetworkRequest(requestId: string): MainNetworkRequestEntry | null {
  return byRequestId.get(requestId) ?? null;
}

/** 메인 저장소의 요청 목록 (targetType 포함). 시간순. */
export function getMainNetworkRequestList(): MainNetworkRequestEntry[] {
  return orderList.map((rid) => byRequestId.get(rid)).filter(Boolean) as MainNetworkRequestEntry[];
}
