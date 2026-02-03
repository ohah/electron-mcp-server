/**
 * Node-only MCP server (no Electron in this process).
 * Connects to Electron apps via CDP (--remote-debugging-port=9222).
 */

import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { getElectronWindowInfo } from './discovery';
import { sendCommandToElectron } from './commands';
import { takeScreenshot } from './screenshot';

const getElectronWindowInfoSchema = z.object({
  includeChildren: z.boolean().optional().describe('Include child/DevTools windows'),
});
const takeScreenshotSchema = z.object({
  outputPath: z.string().optional().describe('Optional file path to save'),
  windowTitle: z.string().optional().describe('Filter by window title'),
});
const sendCommandToElectronSchema = z.object({
  command: z.string().optional().describe('get_title | get_url | get_body_text | eval'),
  args: z.object({ code: z.string().optional() }).optional(),
});

type GetElectronWindowInfoArgs = z.infer<typeof getElectronWindowInfoSchema>;
type TakeScreenshotArgs = z.infer<typeof takeScreenshotSchema>;
type SendCommandToElectronArgs = z.infer<typeof sendCommandToElectronSchema>;

/** Wraps server.registerTool to avoid TS2589 (excessively deep instantiation) from SDK generics. */
function registerTool<TArgs>(
  server: McpServer,
  name: string,
  description: string,
  inputSchema: z.ZodTypeAny,
  handler: (args: TArgs) => Promise<{ content: unknown[] }>
): void {
  (
    server as {
      registerTool(
        name: string,
        def: { description: string; inputSchema: z.ZodTypeAny },
        handler: (args: unknown) => Promise<unknown>
      ): void;
    }
  ).registerTool(name, { description, inputSchema }, (args: unknown) => handler(args as TArgs));
}

async function main() {
  const server = new McpServer({
    name: 'electron-mcp-server',
    version: '1.0.0',
  });

  registerTool<GetElectronWindowInfoArgs>(
    server,
    'get_electron_window_info',
    'Get information about running Electron apps (windows). Detects apps with remote debugging on port 9222.',
    getElectronWindowInfoSchema,
    async (args) => {
      const result = await getElectronWindowInfo(!!args?.includeChildren);
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
      };
    }
  );

  registerTool<TakeScreenshotArgs>(
    server,
    'take_screenshot',
    'Take a screenshot of a running Electron app. Returns base64 PNG.',
    takeScreenshotSchema,
    async (args) => {
      const { base64, filePath } = await takeScreenshot(args?.outputPath, args?.windowTitle);
      const content: Array<
        { type: 'text'; text: string } | { type: 'image'; data: string; mimeType: string }
      > = [];
      if (filePath) {
        content.push({ type: 'text', text: `Saved: ${filePath}` });
      }
      content.push({
        type: 'image',
        data: base64,
        mimeType: 'image/png',
      });
      return { content };
    }
  );

  registerTool<SendCommandToElectronArgs>(
    server,
    'send_command_to_electron',
    'Run JavaScript in the Electron app. Commands: get_title, get_url, get_body_text, eval (args.code).',
    sendCommandToElectronSchema,
    async (args) => {
      const command = args?.command ?? 'get_title';
      const cmdArgs = args?.args;
      const text = await sendCommandToElectron(command, {
        code: cmdArgs?.code,
      });
      return {
        content: [{ type: 'text' as const, text }],
      };
    }
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(
    '[electron-mcp-server] Running on stdio (Node). Use Electron with --remote-debugging-port=9222'
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
