/**
 * 구조적 로거. stderr로 출력 (MCP 서버는 stdout을 프로토콜에 사용).
 * LOG_LEVEL 환경 변수로 레벨 조절: debug, info, warn, error (기본: info).
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

function getConfiguredLevel(): LogLevel {
  const env = process.env.LOG_LEVEL?.toLowerCase();
  if (env && env in LEVEL_ORDER) return env as LogLevel;
  return 'info';
}

let currentLevel = getConfiguredLevel();

function shouldLog(level: LogLevel): boolean {
  return LEVEL_ORDER[level] >= LEVEL_ORDER[currentLevel];
}

function formatMessage(level: LogLevel, module: string, message: string, data?: unknown): string {
  const ts = new Date().toISOString();
  const prefix = `[${ts}] [${level.toUpperCase()}] [${module}]`;
  if (data !== undefined) {
    const dataStr = typeof data === 'string' ? data : JSON.stringify(data);
    return `${prefix} ${message} ${dataStr}`;
  }
  return `${prefix} ${message}`;
}

export interface Logger {
  debug(message: string, data?: unknown): void;
  info(message: string, data?: unknown): void;
  warn(message: string, data?: unknown): void;
  error(message: string, data?: unknown): void;
}

export function createLogger(module: string): Logger {
  return {
    debug(message: string, data?: unknown) {
      if (shouldLog('debug')) console.error(formatMessage('debug', module, message, data));
    },
    info(message: string, data?: unknown) {
      if (shouldLog('info')) console.error(formatMessage('info', module, message, data));
    },
    warn(message: string, data?: unknown) {
      if (shouldLog('warn')) console.error(formatMessage('warn', module, message, data));
    },
    error(message: string, data?: unknown) {
      if (shouldLog('error')) console.error(formatMessage('error', module, message, data));
    },
  };
}

/** 런타임에 로그 레벨 변경 */
export function setLogLevel(level: LogLevel): void {
  currentLevel = level;
}

/** 현재 로그 레벨 반환 */
export function getLogLevel(): LogLevel {
  return currentLevel;
}
