/**
 * MCP tools: get_console_message, list_console_messages
 * CDP Console.enable + Console.messageAdded 수집.
 */

import { z } from 'zod';
import { WebSocket } from 'ws';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { findElectronTarget, sendCdp } from './electron';

export interface ConsoleMessageEntry {
  source: string;
  level: string;
  text: string;
  url?: string;
  line?: number;
  column?: number;
}

export async function collectConsoleMessages(waitMs: number = 500): Promise<ConsoleMessageEntry[]> {
  const target = await findElectronTarget();
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise<void>((resolve, reject) => {
    ws.once('open', () => resolve());
    ws.once('error', reject);
  });

  const messages: ConsoleMessageEntry[] = [];
  const handler = (raw: Buffer) => {
    try {
      const msg = JSON.parse(raw.toString()) as { method?: string; params?: { message?: unknown } };
      if (msg.method === 'Console.messageAdded' && msg.params?.message) {
        const m = msg.params.message as ConsoleMessageEntry;
        messages.push({
          source: m.source ?? 'unknown',
          level: m.level ?? 'log',
          text: m.text ?? '',
          url: m.url,
          line: m.line,
          column: m.column,
        });
      }
    } catch {
      // ignore
    }
  };
  ws.on('message', handler);

  try {
    await sendCdp(ws, 1, 'Console.enable');
    await new Promise((r) => setTimeout(r, waitMs));
  } finally {
    ws.off('message', handler);
    ws.close();
  }
  return messages;
}

const listSchema = z.object({
  waitMs: z.number().optional().describe('수집 대기 시간(ms). 기본 500'),
});

export const listConsoleMessagesTool = {
  name: 'list_console_messages' as const,
  description:
    'Electron 렌더러 콘솔 메시지 목록을 가져옵니다. Console.enable 후 waitMs 동안 수집한 메시지를 반환합니다.',
  inputSchema: listSchema,
  handler: async (args: z.infer<typeof listSchema>) => {
    const waitMs = args?.waitMs ?? 500;
    const messages = await collectConsoleMessages(waitMs);
    const text = JSON.stringify(
      messages.map((m) => ({ level: m.level, text: m.text, source: m.source, url: m.url })),
      null,
      2
    );
    return { content: [{ type: 'text' as const, text }] };
  },
};

const getSchema = z.object({
  index: z.number().optional().describe('0-based 인덱스. 생략 시 마지막 메시지'),
  waitMs: z.number().optional().describe('수집 대기 시간(ms). 기본 500'),
});

export const getConsoleMessageTool = {
  name: 'get_console_message' as const,
  description:
    'Electron 렌더러 콘솔 메시지 하나를 가져옵니다. index로 n번째(0-based), 생략 시 마지막 메시지.',
  inputSchema: getSchema,
  handler: async (args: z.infer<typeof getSchema>) => {
    const waitMs = args?.waitMs ?? 500;
    const index = args?.index;
    const messages = await collectConsoleMessages(waitMs);
    if (messages.length === 0) {
      return { content: [{ type: 'text' as const, text: 'No console messages collected.' }] };
    }
    const i =
      index !== undefined ? (index < 0 ? messages.length + index : index) : messages.length - 1;
    const m = messages[i];
    if (!m) {
      return {
        content: [
          {
            type: 'text' as const,
            text: `Index ${index} out of range (0..${messages.length - 1}).`,
          },
        ],
      };
    }
    const text = JSON.stringify(
      { level: m.level, text: m.text, source: m.source, url: m.url },
      null,
      2
    );
    return { content: [{ type: 'text' as const, text }] };
  },
};

export function registerConsoleTools(server: McpServer): void {
  (
    server as {
      registerTool(
        name: string,
        def: { description: string; inputSchema: z.ZodTypeAny },
        handler: (args: unknown) => Promise<unknown>
      ): void;
    }
  ).registerTool(
    listConsoleMessagesTool.name,
    {
      description: listConsoleMessagesTool.description,
      inputSchema: listConsoleMessagesTool.inputSchema,
    },
    (args: unknown) => listConsoleMessagesTool.handler(args as z.infer<typeof listSchema>)
  );
  (
    server as {
      registerTool(
        name: string,
        def: { description: string; inputSchema: z.ZodTypeAny },
        handler: (args: unknown) => Promise<unknown>
      ): void;
    }
  ).registerTool(
    getConsoleMessageTool.name,
    {
      description: getConsoleMessageTool.description,
      inputSchema: getConsoleMessageTool.inputSchema,
    },
    (args: unknown) => getConsoleMessageTool.handler(args as z.infer<typeof getSchema>)
  );
}
