/**
 * 입력·자동화 (Input automation)
 * click: CDP Input.dispatchMouseEvent로 요소 클릭. 나머지는 스텁.
 * @see https://github.com/ohah/electron-mcp-server/issues/3
 */

import { z } from 'zod';
import { WebSocket } from 'ws';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { findElectronTarget, sendCdp } from './electron';

const emptySchema = z.object({});
const TODO_MSG = 'TODO: Chrome DevTools MCP 로드맵 기능 — 미구현';

function registerStub(
  server: McpServer,
  name: string,
  description: string,
  inputSchema: z.ZodTypeAny = emptySchema
): void {
  (
    server as {
      registerTool(
        name: string,
        def: { description: string; inputSchema: z.ZodTypeAny },
        handler: (args: unknown) => Promise<unknown>
      ): void;
    }
  ).registerTool(name, { description, inputSchema }, async () => ({
    content: [{ type: 'text' as const, text: TODO_MSG }],
  }));
}

/** CDP로 selector 요소 중앙에 클릭 이벤트 전송 */
export async function clickInElectron(selector: string): Promise<void> {
  const target = await findElectronTarget();
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise<void>((resolve, reject) => {
    ws.once('open', () => resolve());
    ws.once('error', reject);
  });
  try {
    await sendCdp(ws, 1, 'Runtime.enable');
    const expr = `(function(sel) {
      var el = document.querySelector(sel);
      if (!el) return null;
      var r = el.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    })(${JSON.stringify(selector)})`;
    const evalResult = (await sendCdp(ws, 2, 'Runtime.evaluate', {
      expression: expr,
      returnByValue: true,
    })) as { result?: { type?: string; value?: { x: number; y: number } } };
    const coord = evalResult?.result?.type === 'object' ? evalResult.result.value : null;
    if (!coord || typeof coord.x !== 'number' || typeof coord.y !== 'number') {
      throw new Error(`Element not found or not visible: ${selector}`);
    }
    const { x, y } = coord;
    const ts = Date.now() / 1000;
    await sendCdp(ws, 3, 'Input.dispatchMouseEvent', {
      type: 'mousePressed',
      x,
      y,
      button: 'left',
      clickCount: 1,
      timestamp: ts,
    });
    await sendCdp(ws, 4, 'Input.dispatchMouseEvent', {
      type: 'mouseReleased',
      x,
      y,
      button: 'left',
      clickCount: 1,
      timestamp: ts,
    });
  } finally {
    ws.close();
  }
}

const clickSchema = z.object({
  selector: z.string().describe('CSS 선택자. 예: "button", "#id", ".class"'),
});

export function registerInputTools(server: McpServer): void {
  (
    server as {
      registerTool(
        name: string,
        def: { description: string; inputSchema: z.ZodTypeAny },
        handler: (args: unknown) => Promise<unknown>
      ): void;
    }
  ).registerTool(
    'click',
    {
      description:
        'Electron 렌더러에서 CSS 선택자로 요소를 찾아 클릭합니다. CDP Input.dispatchMouseEvent 사용.',
      inputSchema: clickSchema,
    },
    async (args: unknown) => {
      const { selector } = clickSchema.parse(args);
      await clickInElectron(selector);
      return { content: [{ type: 'text' as const, text: `Clicked: ${selector}` }] };
    }
  );
  registerStub(server, 'drag', '요소 드래그 앤 드롭 (from_uid → to_uid)');
  registerStub(server, 'fill', '입력/텍스트 영역에 입력, select 옵션 선택');
  registerStub(server, 'fill_form', '여러 폼 필드 한 번에 채우기');
  registerStub(server, 'handle_dialog', '브라우저 다이얼로그(alert/confirm/prompt) 처리');
  registerStub(server, 'hover', '요소 위에 마우스 호버');
  registerStub(server, 'press_key', '키/키 조합 입력 (단축키, 내비게이션 키 등)');
  registerStub(server, 'upload_file', '파일 입력 요소로 파일 업로드');
}
