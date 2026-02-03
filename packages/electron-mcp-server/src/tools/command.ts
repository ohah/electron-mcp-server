/**
 * MCP tool: send_command_to_electron
 * 보안: eval/default는 신뢰할 수 있는 MCP 클라이언트에만 노출할 것.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { executeInElectron } from './electron';

function sendCommandToElectron(command: string, args?: { code?: string }): Promise<string> {
  const cmd = (command || '').toLowerCase();
  let code: string;
  switch (cmd) {
    case 'get_title':
      code = 'document.title';
      break;
    case 'get_url':
      code = 'window.location.href';
      break;
    case 'get_body_text':
      code = "document.body?.innerText?.substring(0, 5000) ?? ''";
      break;
    case 'eval':
      code = args?.code ?? '';
      if (!code) throw new Error('eval requires args.code');
      break;
    default:
      code = args?.code ?? command;
  }
  return executeInElectron(code);
}

const schema = z.object({
  command: z.string().optional().describe('get_title | get_url | get_body_text | eval'),
  args: z.object({ code: z.string().optional() }).optional(),
});

export const sendCommandToElectronTool = {
  name: 'send_command_to_electron' as const,
  description:
    'Run JavaScript in the Electron app. Commands: get_title, get_url, get_body_text, eval (args.code).',
  inputSchema: schema,
  handler: async (args: z.infer<typeof schema>) => {
    const command = args?.command ?? 'get_title';
    const text = await sendCommandToElectron(command, { code: args?.args?.code });
    return {
      content: [{ type: 'text' as const, text }],
    };
  },
};

export function registerSendCommandToElectron(server: McpServer): void {
  (
    server as {
      registerTool(
        name: string,
        def: { description: string; inputSchema: z.ZodTypeAny },
        handler: (args: unknown) => Promise<unknown>
      ): void;
    }
  ).registerTool(
    sendCommandToElectronTool.name,
    {
      description: sendCommandToElectronTool.description,
      inputSchema: sendCommandToElectronTool.inputSchema,
    },
    (args: unknown) => sendCommandToElectronTool.handler(args as z.infer<typeof schema>)
  );
}
