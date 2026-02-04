/**
 * MCP tools: list_console_messages, get_console_message
 * Chrome DevTools MCP와 동일 스펙: 상시 수집·내비게이션 버킷(최근 3개),
 * pageIdx/pageSize/types/includePreservedMessages, get은 msgid로 조회.
 * @see https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/main/docs/tool-reference.md
 */

import { z } from 'zod';
import { WebSocket } from 'ws';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { findElectronTarget, sendCdp } from './electron';

export interface ConsoleMessageEntry {
  msgid: number;
  source: string;
  level: string;
  text: string;
  url?: string;
  line?: number;
  column?: number;
}

const MAX_NAVIGATION_SAVED = 3;
let nextMsgId = 1;

let consoleCaptureWs: WebSocket | null = null;
let consoleCaptureTargetId: string | null = null;
/** msgid → 메시지 (현재 + preserved 모두에서 조회용) */
const byMsgId = new Map<number, ConsoleMessageEntry>();
/** navigations[0] = 현재 내비게이션 메시지 목록 */
const navigationBuckets: ConsoleMessageEntry[][] = [[]];

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

async function startConsoleCaptureIfNeeded(): Promise<void> {
  const target = await findElectronTarget();
  const needReconnect =
    !consoleCaptureWs ||
    consoleCaptureWs.readyState !== WebSocket.OPEN ||
    consoleCaptureTargetId !== target.id;
  if (!needReconnect) {
    return;
  }
  if (consoleCaptureWs) {
    try {
      consoleCaptureWs.close();
    } catch {
      // ignore
    }
    consoleCaptureWs = null;
  }
  consoleCaptureTargetId = null;
  clearConsoleState();

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
          message?: {
            source?: string;
            level?: string;
            text?: string;
            url?: string;
            line?: number;
            column?: number;
          };
          frame?: { id?: string; parentId?: string };
        };
      };
      const method = msg.method;
      const params = msg.params ?? {};

      if (method === 'Console.messageAdded' && params.message) {
        const m = params.message;
        const entry: ConsoleMessageEntry = {
          msgid: nextMsgId++,
          source: m.source ?? 'unknown',
          level: m.level ?? 'log',
          text: m.text ?? '',
          url: m.url,
          line: m.line,
          column: m.column,
        };
        addToCurrentBucket(entry);
      } else if (method === 'Page.frameNavigated') {
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
  ws.on('close', () => {
    if (consoleCaptureWs === ws) {
      consoleCaptureWs = null;
      consoleCaptureTargetId = null;
      clearConsoleState();
    }
  });
  ws.on('error', () => {
    if (consoleCaptureWs === ws) {
      consoleCaptureWs = null;
      consoleCaptureTargetId = null;
      clearConsoleState();
    }
  });

  await sendCdp(ws, 'Console.enable');
  await sendCdp(ws, 'Page.enable');
  consoleCaptureWs = ws;
  consoleCaptureTargetId = target.id;
}

/** 현재 내비 또는 최근 3개 내비 메시지. types로 level/source 필터. */
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
      'Filter messages to only return messages of the specified types (e.g. level: log, warning, error; or source: javascript, console-api). When omitted or empty, returns all messages.'
    ),
  includePreservedMessages: z
    .boolean()
    .optional()
    .describe(
      'Set to true to return the preserved messages over the last 3 navigations. Default false.'
    ),
});

const getSchema = z.object({
  msgid: z.number().describe('The msgid of a console message from the listed console messages.'),
});

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
        'List all console messages for the currently selected page since the last navigation. Use msgid from this list in get_console_message.',
      inputSchema: listSchema,
    },
    async (args: unknown) => {
      const params = listSchema.parse(args ?? {});
      await startConsoleCaptureIfNeeded();
      const includePreserved = params.includePreservedMessages ?? false;
      const types = params.types;
      const all = getStoredMessages(includePreserved, types);
      const pageIdx = params.pageIdx ?? 0;
      const pageSize = params.pageSize;
      const slice =
        pageSize != null && pageSize > 0
          ? all.slice(pageIdx * pageSize, (pageIdx + 1) * pageSize)
          : all;
      const list = slice.map((m) => ({
        msgid: m.msgid,
        level: m.level,
        text: m.text,
        source: m.source,
        url: m.url,
        line: m.line,
        column: m.column,
      }));
      const text = JSON.stringify(list, null, 2);
      return { content: [{ type: 'text' as const, text }] };
    }
  );

  s.registerTool(
    'get_console_message',
    {
      description:
        'Gets a console message by its ID. You can get all messages by calling list_console_messages.',
      inputSchema: getSchema,
    },
    async (args: unknown) => {
      const params = getSchema.parse(args);
      const msgid = params.msgid;
      await startConsoleCaptureIfNeeded();
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
      const text = JSON.stringify(
        {
          msgid: entry.msgid,
          level: entry.level,
          text: entry.text,
          source: entry.source,
          url: entry.url,
          line: entry.line,
          column: entry.column,
        },
        null,
        2
      );
      return { content: [{ type: 'text' as const, text }] };
    }
  );
}
