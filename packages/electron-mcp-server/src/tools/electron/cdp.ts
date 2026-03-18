/**
 * CDP (Chrome DevTools Protocol) 통신: WebSocket 연결, 요청/응답 처리.
 */

import WebSocket from 'ws';
import { CDP_REQUEST_TIMEOUT_MS } from '../constants';
import { createLogger } from '../logger';
import type { DevToolsTarget } from './types';

const logger = createLogger('cdp');

/** 프로세스 전역 CDP 요청 id. 멀티 윈도우·동시 호출 시에도 응답 매칭 충돌 방지. */
let nextCdpId = 1;

/** CDP WebSocket 연결을 열고, 콜백 실행 후 연결 종료. 여러 툴에서 공통 사용. */
export function withCdpWs<T>(
  target: DevToolsTarget,
  fn: (ws: WebSocket) => Promise<T>
): Promise<T> {
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  return new Promise((resolve, reject) => {
    ws.once('open', () => {
      fn(ws)
        .then(resolve, reject)
        .finally(() => ws.close());
    });
    ws.once('error', (err) => {
      logger.error('WebSocket connection error', { target: target.id, error: String(err) });
      reject(err);
    });
  });
}

/** CDP 요청 한 건 보내고 응답 대기. id는 내부 카운터로 자동 부여. timeout·close/error 시 reject. */
export function sendCdp(ws: WebSocket, method: string, params?: object): Promise<unknown> {
  const id = nextCdpId++;
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      ws.off('message', handler);
      ws.off('close', onClose);
      ws.off('error', onError);
      clearTimeout(timer);
    };
    const done = (err: Error | null, value?: unknown) => {
      cleanup();
      if (err) reject(err);
      else resolve(value);
    };
    const handler = (raw: Buffer) => {
      try {
        const msg = JSON.parse(raw.toString()) as {
          id?: number;
          error?: { message: string };
          result?: unknown;
        };
        if (msg.id === id) {
          if (msg.error) done(new Error(msg.error.message));
          else done(null, msg.result);
        }
      } catch {
        // ignore
      }
    };
    const onClose = () => done(new Error('CDP WebSocket closed before response'));
    const onError = (e: Error) => done(e ?? new Error('CDP WebSocket error'));
    const timer = setTimeout(
      () => done(new Error(`CDP request ${method} timed out after ${CDP_REQUEST_TIMEOUT_MS}ms`)),
      CDP_REQUEST_TIMEOUT_MS
    );
    ws.on('message', handler);
    ws.once('close', onClose);
    ws.once('error', onError);
    ws.send(JSON.stringify({ id, method, params: params ?? {} }), (err) => {
      if (err) done(err);
    });
  });
}
