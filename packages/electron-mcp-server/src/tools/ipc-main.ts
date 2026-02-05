/**
 * MCP tools: list_electron_main_ipc_events, get_electron_main_ipc_event
 * IPC 모니터: 메인 프로세스에서 ipcMain 래핑, 이벤트를 앱 버퍼에 push → list 호출 시 서버로 가져와 저장 후 앱 버퍼 비우기.
 * @see packages/electron-mcp-server/docs/electron-main-process.md
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { executeInElectron, getMainProcessTarget } from './electron';

export interface IpcMonitorEntry {
  eventId: number;
  channel: string;
  args: unknown[];
  time: number;
  direction?: 'in' | 'invoke';
}

const INSTALL_SCRIPT = `
(function(){
  if (typeof global.__ipcMonitorBuffer !== 'undefined') return 'already installed';
  try {
    const { ipcMain } = require('electron');
    if (!ipcMain) return 'no ipcMain';
    global.__ipcMonitorBuffer = [];
    function safeArg(a) {
      if (a === null || typeof a !== 'object') return a;
      try { return JSON.parse(JSON.stringify(a)); } catch (_) { return '[Object]'; }
    }
    const origOn = ipcMain.on.bind(ipcMain);
    ipcMain.on = function(channel, listener) {
      return origOn(channel, function(event, ...args) {
        global.__ipcMonitorBuffer.push({ channel, args: args.map(safeArg), time: Date.now(), direction: 'in' });
        return listener.apply(this, [event, ...args]);
      });
    };
    if (ipcMain.handle) {
      const origHandle = ipcMain.handle.bind(ipcMain);
      ipcMain.handle = function(channel, listener) {
        return origHandle(channel, function(event, ...args) {
          global.__ipcMonitorBuffer.push({ channel, args: args.map(safeArg), time: Date.now(), direction: 'invoke' });
          return listener.apply(this, [event, ...args]);
        });
      };
    }
    return 'installed';
  } catch (e) {
    return 'error: ' + (e && e.message ? e.message : String(e));
  }
})();
`;

const GET_BUFFER_SCRIPT = `
(function(){
  try {
    return JSON.stringify(global.__ipcMonitorBuffer || []);
  } catch (e) {
    return JSON.stringify({ error: e && e.message ? e.message : String(e) });
  }
})();
`;

const CLEAR_BUFFER_SCRIPT = `
(function(){
  if (global.__ipcMonitorBuffer) global.__ipcMonitorBuffer.length = 0;
  return 'ok';
})();
`;

/** 콘솔/네트워크와 동일하게 서버 저장 개수 상한. 장기 실행 시 메모리 완화. */
const MAX_IPC_EVENTS_SAVED = 500;

let nextEventId = 1;
const serverStore: IpcMonitorEntry[] = [];

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
        channel: string;
        args: unknown[];
        time: number;
        direction?: string;
      }>;
      if (Array.isArray(arr)) {
        for (const item of arr) {
          serverStore.push({
            eventId: nextEventId++,
            channel: item.channel ?? '',
            args: item.args ?? [],
            time: typeof item.time === 'number' ? item.time : Date.now(),
            direction: item.direction === 'invoke' ? 'invoke' : 'in',
          });
        }
      }
      if (serverStore.length > MAX_IPC_EVENTS_SAVED) {
        serverStore.splice(0, serverStore.length - MAX_IPC_EVENTS_SAVED);
      }
    } catch {
      // ignore parse error
    }
    await executeInElectron(CLEAR_BUFFER_SCRIPT, mainTarget);
  });
  fetchAndClearMutex = next;
  await next;
}

const listSchema = z.object({
  pageIdx: z.number().optional().describe('Page number (0-based). Omit for first page.'),
  pageSize: z.number().optional().describe('Max events to return. Omit for all.'),
});

const getSchema = z.object({
  eventId: z.number().describe('Event ID from list_electron_main_ipc_events.'),
});

async function listIpcEventsHandler(args: unknown) {
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
            { error: 'Failed to install IPC monitor in main process.' },
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
      ? serverStore.slice(pageIdx * pageSize, (pageIdx + 1) * pageSize)
      : serverStore;
  const list = slice.map((e) => ({
    eventId: e.eventId,
    channel: e.channel,
    time: e.time,
    direction: e.direction,
    argsPreview: e.args.length,
  }));
  const text = JSON.stringify(list, null, 2);
  return { content: [{ type: 'text' as const, text }] };
}

async function getIpcEventHandler(args: unknown) {
  const params = getSchema.parse(args);
  const entry = serverStore.find((e) => e.eventId === params.eventId);
  if (!entry) {
    return {
      content: [
        {
          type: 'text' as const,
          text: `IPC event not found: eventId=${params.eventId}. Use eventId from list_electron_main_ipc_events.`,
        },
      ],
    };
  }
  const text = JSON.stringify(entry, null, 2);
  return { content: [{ type: 'text' as const, text }] };
}

export function registerIpcMainTools(server: McpServer): void {
  const s = server as {
    registerTool(
      name: string,
      def: { description: string; inputSchema: z.ZodTypeAny },
      handler: (args: unknown) => Promise<unknown>
    ): void;
  };

  s.registerTool(
    'list_electron_main_ipc_events',
    {
      description:
        'List IPC events received by the Electron main process. Installs a minimal ipcMain wrapper if needed, then fetches app buffer into server storage and clears the app buffer. Call repeatedly to see new events.',
      inputSchema: listSchema,
    },
    listIpcEventsHandler
  );

  s.registerTool(
    'get_electron_main_ipc_event',
    {
      description: 'Get a single IPC event by eventId from list_electron_main_ipc_events.',
      inputSchema: getSchema,
    },
    getIpcEventHandler
  );
}
