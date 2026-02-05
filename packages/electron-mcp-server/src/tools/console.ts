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

const MAX_NAVIGATION_SAVED = 3;
let nextMsgId = 1;

let mainWs: WebSocket | null = null;
let rendererWs: WebSocket | null = null;
let rendererTargetId: string | null = null;
/** msgid → 메시지 */
const byMsgId = new Map<number, ConsoleMessageEntry>();
const navigationBuckets: ConsoleMessageEntry[][] = [[]];
/** includeMainProcess로 메인 캡처 여부. 재연결 시 사용 */
let captureMain = true;

function ensureCurrentBucket(): void {
  if (navigationBuckets.length === 0) {
    navigationBuckets.push([]);
  }
}

function addToCurrentBucket(entry: ConsoleMessageEntry): void {
  ensureCurrentBucket();
  navigationBuckets[0].push(entry);
  byMsgId.set(entry.msgid, entry);
}

function splitAfterNavigation(): void {
  navigationBuckets.unshift([]);
  if (navigationBuckets.length > MAX_NAVIGATION_SAVED) {
    const removed = navigationBuckets.pop();
    if (removed) {
      for (const e of removed) {
        byMsgId.delete(e.msgid);
      }
    }
  }
}

function clearConsoleState(): void {
  byMsgId.clear();
  navigationBuckets.length = 0;
  navigationBuckets.push([]);
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
        };
      };
      const method = msg.method;
      const params = msg.params ?? {};

      if (method === 'Console.messageAdded' && params.message) {
        const m = params.message;
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
        addToCurrentBucket(entry);
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
        addToCurrentBucket(entry);
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
        addToCurrentBucket(entry);
      } else if (method === 'Page.frameNavigated' && targetType === 'renderer') {
        const frame = params.frame;
        if (frame?.id && !frame.parentId) {
          splitAfterNavigation();
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
      // Node(메인) 타겟은 Log.enable 미지원일 수 있음. Console/Runtime만 사용.
    }
    await sendCdp(currentMainWs, 'Runtime.enable');
  }
}

/** 저장된 메시지 반환. timestamp 기준 정렬, types 필터. */
function getStoredMessages(includePreserved: boolean, types?: string[]): ConsoleMessageEntry[] {
  let list: ConsoleMessageEntry[];
  if (!includePreserved) {
    list = navigationBuckets[0] ?? [];
  } else {
    list = [];
    for (let i = 0; i < MAX_NAVIGATION_SAVED && i < navigationBuckets.length; i++) {
      const bucket = navigationBuckets[i];
      if (bucket) list.push(...bucket);
    }
  }
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

function formatMessageEntry(m: ConsoleMessageEntry): object {
  return {
    msgid: m.msgid,
    targetType: m.targetType,
    targetId: m.targetId,
    targetTitle: m.targetTitle,
    timestamp: m.timestamp,
    level: m.level,
    text: m.text,
    source: m.source,
    url: m.url,
    line: m.line,
    column: m.column,
  };
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
        'List console messages for the currently selected page (and main process when includeMainProcess is true). Use targetType to filter by main|renderer|all. One line per message: msgid=N [main|renderer] [level] text. Use msgid in get_console_message for details (response includes targetType). Chrome DevTools MCP style.',
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
      description:
        'Gets a console message by its ID. You can get all messages by calling list_console_messages. Response includes targetType (main|renderer), targetId, targetTitle.',
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
      const text = JSON.stringify(formatMessageEntry(entry), null, 2);
      return { content: [{ type: 'text' as const, text }] };
    }
  );
}
