/**
 * MCP tools: list_console_messages, get_console_message.
 * Chrome DevTools MCP 스타일 + 메인 프로세스 콘솔 병합, Log/Runtime 이벤트 수집.
 * list에 targetType 필터(main|renderer|all), get 응답에 targetType 포함.
 * @see https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/main/docs/tool-reference.md
 */

import { z } from 'zod';
import { WebSocket } from 'ws';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { findRendererTarget, getMainProcessTarget, sendCdp, type DevToolsTarget } from './electron';
import { NavigationBucketStore } from './navigation-bucket-store';
import { createLogger } from './logger';

const logger = createLogger('console');

export interface ConsoleMessageEntry {
  msgid: number;
  /** 메인 프로세스 vs 렌더러 구분 */
  targetType: 'main' | 'renderer';
  targetId: string;
  targetTitle: string;
  /** 수신 시각(정렬용) */
  timestamp: number;
  source: string;
  level: string;
  text: string;
  url?: string;
  line?: number;
  column?: number;
}

let nextMsgId = 1;

let mainWs: WebSocket | null = null;
let rendererWs: WebSocket | null = null;
let rendererTargetId: string | null = null;
/** msgid → 메시지 */
const byMsgId = new Map<number, ConsoleMessageEntry>();
const bucketStore = new NavigationBucketStore<ConsoleMessageEntry>({
  onEvict: (entries: ConsoleMessageEntry[]) => {
    for (const e of entries) {
      byMsgId.delete(e.msgid);
    }
  },
});
/** includeMainProcess로 메인 캡처 여부. 재연결 시 사용 */
let captureMain = true;

function addEntry(entry: ConsoleMessageEntry): void {
  bucketStore.add(entry);
  byMsgId.set(entry.msgid, entry);
}

function clearConsoleState(): void {
  byMsgId.clear();
  bucketStore.clear();
}

function closeAllCapture(): void {
  for (const ws of [mainWs, rendererWs]) {
    if (ws) {
      try {
        ws.close();
      } catch {
        // ignore
      }
    }
  }
  mainWs = null;
  rendererWs = null;
  rendererTargetId = null;
  clearConsoleState();
}

function makeEntry(
  targetType: 'main' | 'renderer',
  target: DevToolsTarget,
  source: string,
  level: string,
  text: string,
  url?: string,
  line?: number,
  column?: number
): ConsoleMessageEntry {
  return {
    msgid: nextMsgId++,
    targetType,
    targetId: target.id,
    targetTitle: target.title || (targetType === 'main' ? 'main' : target.url || ''),
    timestamp: Date.now(),
    source,
    level,
    text,
    url,
    line,
    column,
  };
}

/** Format a CDP Runtime.RemoteObject preview property value. */
interface RemoteObjectPreviewProperty {
  name: string;
  type: string;
  value?: string;
  subtype?: string;
  valuePreview?: RemoteObjectPreview;
}

interface RemoteObjectPreview {
  type: string;
  subtype?: string;
  description?: string;
  overflow: boolean;
  properties: RemoteObjectPreviewProperty[];
}

interface RemoteObjectLike {
  type: string;
  subtype?: string;
  className?: string;
  value?: unknown;
  description?: string;
  objectId?: string;
  preview?: RemoteObjectPreview;
}

function formatObjectPreview(preview: RemoteObjectPreview): string {
  if (preview.type === 'object' && preview.subtype === 'array') {
    const items = preview.properties.map((p) => {
      if (p.valuePreview) return formatObjectPreview(p.valuePreview);
      return p.value ?? p.type;
    });
    return `[${items.join(', ')}]${preview.overflow ? ', ...' : ''}`;
  }
  const pairs = preview.properties.map((p) => {
    const val = p.valuePreview ? formatObjectPreview(p.valuePreview) : (p.value ?? p.type);
    return `${p.name}: ${val}`;
  });
  return `{${pairs.join(', ')}}${preview.overflow ? ', ...' : ''}`;
}

function formatRemoteObject(arg: RemoteObjectLike): string {
  if (arg.type === 'string') return String(arg.value ?? '');
  if (arg.type === 'number' || arg.type === 'boolean') return String(arg.value);
  if (arg.type === 'undefined') return 'undefined';
  if (arg.type === 'symbol') return arg.description ?? 'Symbol()';
  if (arg.type === 'bigint') return arg.description ?? String(arg.value);
  if (arg.type === 'function') return arg.description ?? 'function(){}';
  // object types
  if (arg.subtype === 'null') return 'null';
  if (arg.subtype === 'regexp' || arg.subtype === 'date' || arg.subtype === 'error') {
    return arg.description ?? '';
  }
  if (arg.preview) return formatObjectPreview(arg.preview);
  return arg.description ?? '[object Object]';
}

/** Runtime.getProperties 응답의 PropertyDescriptor */
interface PropertyDescriptor {
  name: string;
  value?: RemoteObjectLike;
  get?: RemoteObjectLike;
  set?: RemoteObjectLike;
  configurable?: boolean;
  enumerable?: boolean;
  isOwn?: boolean;
}

const MAX_RESOLVE_DEPTH = 5;
const MAX_PROPERTIES = 50;

/**
 * Runtime.getProperties로 객체 속성을 재귀 탐색하여 포맷.
 * JSON.stringify 없이 동작하므로 순환 참조, non-serializable 값도 안전.
 */
async function formatWithGetProperties(
  ws: WebSocket,
  objectId: string,
  subtype: string | undefined,
  depth: number,
  seen: Set<string>
): Promise<string> {
  if (depth > MAX_RESOLVE_DEPTH) return '{...}';
  if (seen.has(objectId)) return '[Circular]';
  seen.add(objectId);

  try {
    const res = (await sendCdp(ws, 'Runtime.getProperties', {
      objectId,
      ownProperties: true,
      generatePreview: true,
    })) as { result?: PropertyDescriptor[] };

    const descriptors = res?.result;
    if (!descriptors || descriptors.length === 0) return '{}';

    const isArray = subtype === 'array';
    const entries: string[] = [];
    let truncated = false;

    for (const prop of descriptors) {
      // 배열의 내부 속성(length 등)은 건너뛰기
      if (isArray && prop.name === 'length') continue;
      // getter/setter만 있고 value 없는 경우 건너뛰기
      if (!prop.value) continue;

      if (entries.length >= MAX_PROPERTIES) {
        truncated = true;
        break;
      }

      const val = await formatResolvedValue(ws, prop.value, depth + 1, seen);

      if (isArray) {
        entries.push(val);
      } else {
        entries.push(`${prop.name}: ${val}`);
      }
    }

    const suffix = truncated ? ', ...' : '';
    return isArray ? `[${entries.join(', ')}${suffix}]` : `{${entries.join(', ')}${suffix}}`;
  } catch {
    return '[object Object]';
  }
}

/** 단일 RemoteObject 값을 포맷. 객체면 재귀 탐색. */
async function formatResolvedValue(
  ws: WebSocket,
  value: RemoteObjectLike,
  depth: number,
  seen: Set<string>
): Promise<string> {
  // 프리미티브 타입
  if (value.type === 'string') return JSON.stringify(value.value ?? '');
  if (value.type === 'number' || value.type === 'boolean') return String(value.value);
  if (value.type === 'undefined') return 'undefined';
  if (value.type === 'symbol') return value.description ?? 'Symbol()';
  if (value.type === 'bigint') return `${value.description ?? value.value}n`;
  if (value.type === 'function') return value.description ?? 'function(){}';

  // null
  if (value.subtype === 'null') return 'null';

  // 특수 객체
  if (value.subtype === 'regexp' || value.subtype === 'date' || value.subtype === 'error') {
    return value.description ?? String(value.value);
  }

  // Map, Set, WeakMap 등
  if (value.subtype === 'map' || value.subtype === 'set') {
    return value.description ?? `${value.className ?? value.subtype}(…)`;
  }

  // Promise, generator 등
  if (value.subtype === 'promise' || value.subtype === 'generator') {
    return value.description ?? `${value.className ?? value.subtype}`;
  }

  // 일반 객체/배열: objectId가 있으면 재귀 탐색
  if (value.objectId && depth <= MAX_RESOLVE_DEPTH) {
    return formatWithGetProperties(ws, value.objectId, value.subtype, depth, seen);
  }

  // objectId 없거나 depth 초과 → preview 또는 description 사용
  if (value.preview) return formatObjectPreview(value.preview);
  return value.description ?? '[object Object]';
}

/** objectId가 있는 args를 deep resolve. WebSocket이 열려 있어야 한다. */
async function deepResolveArgs(ws: WebSocket, args: RemoteObjectLike[]): Promise<string[]> {
  const results: string[] = [];
  for (const arg of args) {
    if (
      arg.objectId &&
      (arg.type === 'object' || arg.type === 'function') &&
      arg.subtype !== 'null'
    ) {
      try {
        const text = await formatResolvedValue(ws, arg, 0, new Set());
        results.push(text);
      } catch {
        results.push(formatRemoteObject(arg));
      }
    } else {
      results.push(formatRemoteObject(arg));
    }
  }
  return results;
}

function attachMessageHandler(
  ws: WebSocket,
  targetType: 'main' | 'renderer',
  target: DevToolsTarget
): void {
  const handler = (raw: Buffer) => {
    try {
      const msg = JSON.parse(raw.toString()) as {
        method?: string;
        params?: {
          message?: {
            source?: string;
            level?: string;
            text?: string;
            url?: string;
            line?: number;
            column?: number;
          };
          frame?: { id?: string; parentId?: string };
          entry?: {
            level?: string;
            text?: string;
            url?: string;
            lineNumber?: number;
          };
          exceptionDetails?: {
            text?: string;
            exception?: { description?: string };
            url?: string;
            lineNumber?: number;
            columnNumber?: number;
          };
          /** Runtime.consoleAPICalled params */
          type?: string;
          args?: RemoteObjectLike[];
          stackTrace?: {
            callFrames?: Array<{
              url?: string;
              lineNumber?: number;
              columnNumber?: number;
            }>;
          };
        };
      };
      const method = msg.method;
      const params = msg.params ?? {};

      if (method === 'Runtime.consoleAPICalled' && params.args) {
        const args = params.args;
        const level = params.type ?? 'log';
        const frame = params.stackTrace?.callFrames?.[0];
        deepResolveArgs(ws, args)
          .then((parts) => {
            const text = parts.join(' ');
            const entry = makeEntry(
              targetType,
              target,
              'console-api',
              level,
              text,
              frame?.url,
              frame?.lineNumber != null ? frame.lineNumber + 1 : undefined,
              frame?.columnNumber
            );
            addEntry(entry);
          })
          .catch(() => {
            const text = args.map(formatRemoteObject).join(' ');
            const entry = makeEntry(
              targetType,
              target,
              'console-api',
              level,
              text,
              frame?.url,
              frame?.lineNumber != null ? frame.lineNumber + 1 : undefined,
              frame?.columnNumber
            );
            addEntry(entry);
          });
      } else if (method === 'Console.messageAdded' && params.message) {
        const m = params.message;
        if (m.source === 'console-api') return;
        const entry = makeEntry(
          targetType,
          target,
          m.source ?? 'unknown',
          m.level ?? 'log',
          m.text ?? '',
          m.url,
          m.line,
          m.column
        );
        addEntry(entry);
      } else if (method === 'Log.entryAdded' && params.entry) {
        const e = params.entry;
        const entry = makeEntry(
          targetType,
          target,
          'browser',
          e.level ?? 'verbose',
          e.text ?? '',
          e.url,
          e.lineNumber,
          undefined
        );
        addEntry(entry);
      } else if (method === 'Runtime.exceptionThrown' && params.exceptionDetails) {
        const ex = params.exceptionDetails;
        const text =
          ex.exception?.description ?? ex.text ?? JSON.stringify(params.exceptionDetails);
        const entry = makeEntry(
          targetType,
          target,
          'javascript',
          'error',
          text,
          ex.url,
          ex.lineNumber,
          ex.columnNumber
        );
        addEntry(entry);
      } else if (method === 'Page.frameNavigated' && targetType === 'renderer') {
        const frame = params.frame;
        if (frame?.id && !frame.parentId) {
          bucketStore.splitAfterNavigation();
        }
      }
    } catch {
      // ignore
    }
  };
  ws.on('message', handler);
}

async function startConsoleCaptureIfNeeded(includeMainProcess: boolean): Promise<void> {
  captureMain = includeMainProcess;
  const rendererTarget = await findRendererTarget();
  const mainTarget = includeMainProcess ? await getMainProcessTarget() : null;

  const needReconnect =
    (rendererTarget
      ? !rendererWs ||
        rendererWs.readyState !== WebSocket.OPEN ||
        rendererTargetId !== rendererTarget.id
      : rendererWs !== null) ||
    (includeMainProcess && mainTarget && (!mainWs || mainWs.readyState !== WebSocket.OPEN)) ||
    (!includeMainProcess && mainWs !== null);

  if (!needReconnect) {
    return;
  }

  closeAllCapture();

  const openWs = (target: DevToolsTarget): Promise<WebSocket> => {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(target.webSocketDebuggerUrl);
      ws.once('open', () => resolve(ws));
      ws.once('error', reject);
    });
  };

  if (rendererTarget) {
    const currentRendererWs = await openWs(rendererTarget);
    rendererWs = currentRendererWs;
    rendererTargetId = rendererTarget.id;
    attachMessageHandler(currentRendererWs, 'renderer', rendererTarget);
    currentRendererWs.on('close', () => {
      if (rendererWs === currentRendererWs) {
        rendererWs = null;
        rendererTargetId = null;
        clearConsoleState();
      }
    });
    currentRendererWs.on('error', () => {
      if (rendererWs === currentRendererWs) {
        rendererWs = null;
        rendererTargetId = null;
        clearConsoleState();
      }
    });
    await sendCdp(rendererWs, 'Console.enable');
    await sendCdp(rendererWs, 'Page.enable');
    await sendCdp(rendererWs, 'Log.enable');
    await sendCdp(rendererWs, 'Runtime.enable');
    logger.debug('Console capture started for renderer', rendererTarget.id);
  } else {
    rendererWs = null;
    rendererTargetId = null;
  }

  if (mainTarget) {
    const currentMainWs = await openWs(mainTarget);
    mainWs = currentMainWs;
    attachMessageHandler(currentMainWs, 'main', mainTarget);
    currentMainWs.on('close', () => {
      if (mainWs === currentMainWs) mainWs = null;
    });
    currentMainWs.on('error', () => {
      if (mainWs === currentMainWs) mainWs = null;
    });
    await sendCdp(currentMainWs, 'Console.enable');
    try {
      await sendCdp(currentMainWs, 'Log.enable');
    } catch {
      // Node(메인) 타겟은 Log.enable 미지원일 수 있음
    }
    await sendCdp(currentMainWs, 'Runtime.enable');
    logger.debug('Console capture started for main process');
  }
}

/** 저장된 메시지 반환. timestamp 기준 정렬, types 필터. */
function getStoredMessages(includePreserved: boolean, types?: string[]): ConsoleMessageEntry[] {
  let list = bucketStore.getAllEntries(includePreserved);
  list = [...list].sort((a, b) => a.timestamp - b.timestamp);
  if (types && types.length > 0) {
    const set = new Set(types.map((t) => t.toLowerCase()));
    list = list.filter((m) => set.has(m.level.toLowerCase()) || set.has(m.source.toLowerCase()));
  }
  return list;
}

const listSchema = z.object({
  pageIdx: z
    .number()
    .optional()
    .describe('Page number to return (0-based). When omitted, returns the first page.'),
  pageSize: z
    .number()
    .optional()
    .describe('Maximum number of messages to return. When omitted, returns all messages.'),
  types: z
    .array(z.string())
    .optional()
    .describe(
      'Filter messages to only return messages of the specified types (e.g. level: log, warning, error; or source: javascript, console-api, browser). When omitted or empty, returns all messages.'
    ),
  includePreservedMessages: z
    .boolean()
    .optional()
    .describe(
      'Set to true to return the preserved messages over the last 3 navigations. Default false.'
    ),
  includeMainProcess: z
    .boolean()
    .optional()
    .default(true)
    .describe(
      'Include console messages from the Electron main process (node target). Default true. Main and renderer messages are merged and sorted by timestamp.'
    ),
  targetType: z
    .enum(['all', 'main', 'renderer'])
    .optional()
    .default('all')
    .describe(
      'Filter by process: "all" (default), "main" (Electron main process only), "renderer" (page only).'
    ),
});

const getSchema = z.object({
  msgid: z.number().describe('The msgid of a console message from the listed console messages.'),
});

function formatMessageCompact(m: ConsoleMessageEntry): string {
  const lines: string[] = [`[${m.targetType}] [${m.level}] ${m.text}`, `  source: ${m.source}`];
  if (m.url)
    lines.push(
      `  url: ${m.url}${m.line != null ? `:${m.line}` : ''}${m.column != null ? `:${m.column}` : ''}`
    );
  return lines.join('\n');
}

/** Chrome DevTools MCP 스타일 한 줄 요약. list 응답용. targetType으로 메인/렌더러 구분. */
function formatMessageOneLine(m: ConsoleMessageEntry): string {
  return `msgid=${m.msgid} [${m.targetType}] [${m.level}] ${m.text}`;
}

export function registerConsoleTools(server: McpServer): void {
  const s = server as {
    registerTool(
      name: string,
      def: { description: string; inputSchema: z.ZodTypeAny },
      handler: (args: unknown) => Promise<unknown>
    ): void;
  };
  s.registerTool(
    'list_console_messages',
    {
      description:
        'List console messages. One line per message: msgid=N [main|renderer] [level] text. Use msgid in get_console_message. Filter by targetType (main|renderer|all).',
      inputSchema: listSchema,
    },
    async (args: unknown) => {
      const params = listSchema.parse(args ?? {});
      await startConsoleCaptureIfNeeded(params.includeMainProcess ?? true);
      const includePreserved = params.includePreservedMessages ?? false;
      const types = params.types;
      const targetFilter = params.targetType ?? 'all';
      let all = getStoredMessages(includePreserved, types);
      if (targetFilter !== 'all') {
        all = all.filter((m) => m.targetType === targetFilter);
      }
      const pageIdx = params.pageIdx ?? 0;
      const pageSize = params.pageSize;
      const slice =
        pageSize != null && pageSize > 0
          ? all.slice(pageIdx * pageSize, (pageIdx + 1) * pageSize)
          : all;
      const lines: string[] = [];
      if (pageSize != null && pageSize > 0 && all.length > 0) {
        const totalPages = Math.ceil(all.length / pageSize);
        const startIndex = pageIdx * pageSize;
        const endIndex = Math.min(startIndex + pageSize, all.length);
        lines.push(
          `Showing ${startIndex + 1}-${endIndex} of ${all.length} (Page ${pageIdx + 1} of ${totalPages}).`
        );
      }
      lines.push(...slice.map(formatMessageOneLine));
      const text = lines.join('\n');
      return { content: [{ type: 'text' as const, text }] };
    }
  );

  s.registerTool(
    'get_console_message',
    {
      description: 'Get console message detail by msgid from list_console_messages.',
      inputSchema: getSchema,
    },
    async (args: unknown) => {
      const params = getSchema.parse(args);
      const msgid = params.msgid;
      await startConsoleCaptureIfNeeded(captureMain);
      const entry = byMsgId.get(msgid);
      if (!entry) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `Console message not found for msgid ${msgid}. Use msgid from list_console_messages.`,
            },
          ],
        };
      }
      return { content: [{ type: 'text' as const, text: formatMessageCompact(entry) }] };
    }
  );
}
