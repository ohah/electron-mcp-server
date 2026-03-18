/**
 * CDP WebSocket 커넥션 풀. 동일 타겟에 대해 기존 연결 재사용.
 * 일정 시간(기본 30초) 유휴 시 자동 해제.
 */

import WebSocket from 'ws';
import { createLogger } from '../logger';

const logger = createLogger('connection-pool');

interface PooledConnection {
  ws: WebSocket;
  url: string;
  lastUsed: number;
  refCount: number;
}

const IDLE_TIMEOUT_MS = 30_000;
const pool = new Map<string, PooledConnection>();
let cleanupTimer: ReturnType<typeof setInterval> | null = null;

function startCleanupTimer(): void {
  if (cleanupTimer) return;
  cleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const [url, conn] of pool) {
      if (conn.refCount === 0 && now - conn.lastUsed > IDLE_TIMEOUT_MS) {
        logger.debug(`Closing idle connection: ${url}`);
        try {
          conn.ws.close();
        } catch {
          // ignore
        }
        pool.delete(url);
      }
    }
    if (pool.size === 0 && cleanupTimer) {
      clearInterval(cleanupTimer);
      cleanupTimer = null;
    }
  }, IDLE_TIMEOUT_MS / 2);
  // 타이머가 프로세스를 잡고 있지 않도록
  if (cleanupTimer && typeof cleanupTimer === 'object' && 'unref' in cleanupTimer) {
    cleanupTimer.unref();
  }
}

/**
 * 풀에서 WebSocket을 가져옴. 기존 열린 연결이 있으면 재사용.
 * 사용 완료 시 release()를 호출해야 함.
 */
export async function acquire(wsUrl: string): Promise<{ ws: WebSocket; release: () => void }> {
  const existing = pool.get(wsUrl);
  if (existing && existing.ws.readyState === WebSocket.OPEN) {
    existing.refCount++;
    existing.lastUsed = Date.now();
    logger.debug(`Reusing pooled connection: ${wsUrl}`);
    return {
      ws: existing.ws,
      release: () => {
        existing.refCount--;
        existing.lastUsed = Date.now();
      },
    };
  }

  // 기존 연결이 닫혀있으면 제거
  if (existing) {
    pool.delete(wsUrl);
  }

  const ws = new WebSocket(wsUrl);
  await new Promise<void>((resolve, reject) => {
    ws.once('open', () => resolve());
    ws.once('error', reject);
  });

  const conn: PooledConnection = {
    ws,
    url: wsUrl,
    lastUsed: Date.now(),
    refCount: 1,
  };

  ws.on('close', () => {
    pool.delete(wsUrl);
  });
  ws.on('error', () => {
    pool.delete(wsUrl);
  });

  pool.set(wsUrl, conn);
  startCleanupTimer();
  logger.debug(`New pooled connection: ${wsUrl}`);

  return {
    ws,
    release: () => {
      conn.refCount--;
      conn.lastUsed = Date.now();
    },
  };
}

/** 풀 통계 반환 */
export function getPoolStats(): { total: number; active: number; idle: number } {
  let active = 0;
  let idle = 0;
  for (const conn of pool.values()) {
    if (conn.refCount > 0) active++;
    else idle++;
  }
  return { total: pool.size, active, idle };
}

/** 전체 풀 해제 */
export function clearPool(): void {
  for (const conn of pool.values()) {
    try {
      conn.ws.close();
    } catch {
      // ignore
    }
  }
  pool.clear();
  if (cleanupTimer) {
    clearInterval(cleanupTimer);
    cleanupTimer = null;
  }
}
