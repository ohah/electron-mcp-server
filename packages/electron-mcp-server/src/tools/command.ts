/**
 * MCP tool: send_command_to_electron
 * 보안: eval/default는 신뢰할 수 있는 MCP 클라이언트에만 노출할 것.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { executeInElectron, getMainProcessTarget } from './electron';

function sendCommandToElectron(
  command: string,
  args?: { code?: string; target?: 'main' | 'renderer' }
): Promise<string> {
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
  const runInMain = args?.target === 'main';
  return runInMain
    ? (async () => {
        const mainTarget = await getMainProcessTarget();
        if (!mainTarget)
          throw new Error(
            'No main process target. Is the Electron app running with remote debugging?'
          );
        return executeInElectron(code, mainTarget);
      })()
    : executeInElectron(code);
}

const schema = z.object({
  command: z.string().optional().describe('get_title | get_url | get_body_text | eval'),
  args: z
    .object({
      code: z.string().optional().describe('JavaScript code (required for eval).'),
      target: z
        .enum(['main', 'renderer'])
        .optional()
        .describe(
          'main: 메인 프로세스에서 실행(console.log는 get_electron_main_console_messages로 확인). renderer 또는 생략: 기본 타겟(페이지).'
        ),
    })
    .optional(),
});

export const sendCommandToElectronTool = {
  name: 'send_command_to_electron' as const,
  description:
    'Run JavaScript in the Electron app. Commands: get_title, get_url, get_body_text, eval (args.code). args.target=main 이면 메인 프로세스에서 실행하며, 콘솔 출력은 get_electron_main_console_messages로 확인.',
  inputSchema: schema,
  handler: async (args: z.infer<typeof schema>) => {
    const command = args?.command ?? 'get_title';
    const text = await sendCommandToElectron(command, {
      code: args?.args?.code,
      target: args?.args?.target,
    });
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
