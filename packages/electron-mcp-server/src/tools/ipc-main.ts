/**
 * MCP tools: list_electron_main_ipc_events, get_electron_main_ipc_event
 * Compact text + [ref=ch1] 기반 출력.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { executeInElectron, getMainProcessTarget } from './electron';
import {
  resetIpcRefs,
  addIpcRef,
  parseRef as parseRefFn,
  getIpcRef as getIpcRefFn,
} from './ref-store';
import { MAX_IPC_EVENTS_SAVED } from './constants';

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

function formatIpcList(events: IpcMonitorEntry[]): string {
  resetIpcRefs();
  if (events.length === 0) return '(no IPC events)';

  const lines: string[] = [`# ${events.length} IPC events`];
  for (const e of events) {
    const ref = addIpcRef({ eventId: e.eventId, channel: e.channel, direction: e.direction });
    const dir = e.direction === 'invoke' ? 'invoke' : 'on';
    const argCount = e.args.length;
    lines.push(`- ${dir} [ref=${ref}] "${e.channel}" args=${argCount}`);
  }
  return lines.join('\n');
}

function formatIpcDetail(entry: IpcMonitorEntry): string {
  const lines: string[] = [
    `channel: "${entry.channel}"`,
    `direction: ${entry.direction ?? 'in'}`,
    `time: ${new Date(entry.time).toISOString()}`,
    `args:`,
  ];
  for (let i = 0; i < entry.args.length; i++) {
    const val = typeof entry.args[i] === 'string' ? entry.args[i] : JSON.stringify(entry.args[i]);
    lines.push(`  [${i}] ${val}`);
  }
  return lines.join('\n');
}

const listSchema = z.object({
  pageIdx: z.number().optional().describe('Page number (0-based)'),
  pageSize: z.number().optional().describe('Max events to return'),
});

const getSchema = z.object({
  ref: z.string().optional().describe('IPC event ref (@ch1) from list_electron_main_ipc_events'),
  eventId: z.number().optional().describe('Event ID (legacy)'),
});

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
        'List IPC events from Electron main process. Each event gets [ref=ch1]. Use @ref in get_electron_main_ipc_event.',
      inputSchema: listSchema,
    },
    async (args: unknown) => {
      const params = listSchema.parse(args ?? {});
      const mainTarget = await getMainProcessTarget();
      if (!mainTarget) {
        return {
          content: [
            {
              type: 'text' as const,
              text: 'No main process. Run Electron with --remote-debugging-port.',
            },
          ],
        };
      }
      const installResult = await ensureInstalled(mainTarget);
      if (!installResult) {
        return { content: [{ type: 'text' as const, text: 'Failed to install IPC monitor.' }] };
      }
      await fetchAndClearBuffer(mainTarget);
      const pageIdx = params.pageIdx ?? 0;
      const pageSize = params.pageSize;
      const slice =
        pageSize != null && pageSize > 0
          ? serverStore.slice(pageIdx * pageSize, (pageIdx + 1) * pageSize)
          : serverStore;
      return { content: [{ type: 'text' as const, text: formatIpcList(slice) }] };
    }
  );

  s.registerTool(
    'get_electron_main_ipc_event',
    {
      description: 'Get IPC event detail by ref (@ch1) or eventId.',
      inputSchema: getSchema,
    },
    async (args: unknown) => {
      const params = getSchema.parse(args ?? {});
      let entry: IpcMonitorEntry | undefined;

      if (params.ref) {
        const parsed = parseRefFn(params.ref);
        if (parsed) {
          const ipcRef = getIpcRefFn(parsed);
          if (ipcRef) {
            entry = serverStore.find((e) => e.eventId === ipcRef.eventId);
          }
        }
      }
      if (!entry && params.eventId != null) {
        entry = serverStore.find((e) => e.eventId === params.eventId);
      }

      if (!entry) {
        return {
          content: [
            {
              type: 'text' as const,
              text: 'IPC event not found. Use @ref from list_electron_main_ipc_events.',
            },
          ],
        };
      }
      return { content: [{ type: 'text' as const, text: formatIpcDetail(entry) }] };
    }
  );
}
