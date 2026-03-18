/**
 * 프로젝트 전역 상수. 타임아웃, 스캔 포트, 저장 한도 등.
 */

/** CDP 요청 기본 타임아웃 (ms) */
export const CDP_REQUEST_TIMEOUT_MS = 30_000;

/** CDP 내비게이션 타임아웃 (ms) */
export const CDP_NAVIGATION_TIMEOUT_MS = 30_000;

/** wait_for 폴링 간격 (ms) */
export const WAIT_FOR_POLL_MS = 500;

/** 성능 트레이스 자동 중단 대기 (ms) */
export const AUTO_STOP_TRACE_DURATION_MS = 5_000;

/** Tracing.tracingComplete 대기 타임아웃 (ms) */
export const TRACING_COMPLETE_TIMEOUT_MS = 60_000;

/** 트레이스 시작 후 reload 대기 (ms) */
export const RELOAD_WAIT_MS = 1_500;

/** Electron 원격 디버깅 포트 스캔 순서 */
export const PORTS = [9229, 9230, 9222, 9223, 9224, 9225];

/** 콘솔/네트워크 내비게이션 버킷 보관 개수 */
export const MAX_NAVIGATION_SAVED = 3;

/** IPC 이벤트 서버 저장 상한 */
export const MAX_IPC_EVENTS_SAVED = 500;

/** 메인 프로세스 네트워크 요청 저장 상한 */
export const MAX_MAIN_NETWORK_SAVED = 500;

/** executeInElectron 기본 타임아웃 (ms) */
export const EXECUTE_TIMEOUT_MS = 10_000;

/** 커넥션 풀 유휴 타임아웃 (ms) */
export const CONNECTION_POOL_IDLE_TIMEOUT_MS = 30_000;
