/**
 * 입력·자동화 (Input automation) — Chrome DevTools MCP 스펙
 * click, drag, fill, fill_form, handle_dialog, hover, press_key, upload_file
 * @see https://github.com/ohah/electron-mcp-server/issues/3
 */

import { z } from 'zod';
import { WebSocket } from 'ws';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { findElectronTarget, sendCdp, type DevToolsTarget } from './electron';
import { getBackendNodeIdByUid } from './snapshot';

function withCdpWs<T>(target: DevToolsTarget, fn: (ws: WebSocket) => Promise<T>): Promise<T> {
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  return new Promise((resolve, reject) => {
    ws.once('open', () => {
      fn(ws)
        .then(resolve, reject)
        .finally(() => ws.close());
    });
    ws.once('error', reject);
  });
}

/** uid가 스냅샷에서 온 숫자 문자열이면 true */
function isSnapshotUid(uid: string): boolean {
  return /^\d+$/.test(uid);
}

/** 요소 중앙 좌표 (viewport CSS pixels). uid는 스냅샷 uid 또는 CSS 선택자. */
async function getCenterForUid(
  ws: WebSocket,
  targetId: string,
  uid: string
): Promise<{ x: number; y: number }> {
  const backendNodeId = isSnapshotUid(uid) ? getBackendNodeIdByUid(targetId, uid) : null;
  if (backendNodeId != null) {
    await sendCdp(ws, 'DOM.enable');
    const box = (await sendCdp(ws, 'DOM.getBoxModel', { backendNodeId })) as {
      model?: { content?: number[] };
    };
    const c = box?.model?.content;
    if (c && c.length >= 8) {
      const x = (c[0] + c[4]) / 2;
      const y = (c[1] + c[5]) / 2;
      return { x, y };
    }
  }
  const sel = uid;
  await sendCdp(ws, 'Runtime.enable');
  const expr = `(function(s){
    var el = document.querySelector(s);
    if(!el) return null;
    var r = el.getBoundingClientRect();
    return { x: r.left + r.width/2, y: r.top + r.height/2 };
  })(${JSON.stringify(sel)})`;
  const evalResult = (await sendCdp(ws, 'Runtime.evaluate', {
    expression: expr,
    returnByValue: true,
  })) as { result?: { type?: string; value?: { x: number; y: number } } };
  const coord = evalResult?.result?.type === 'object' ? evalResult.result.value : null;
  if (!coord || typeof coord.x !== 'number' || typeof coord.y !== 'number') {
    throw new Error(`Element not found or not visible: ${uid}`);
  }
  return { x: coord.x, y: coord.y };
}

/** backendNodeId로 요소 중앙 좌표 */
async function getCenterByBackendNodeId(
  ws: WebSocket,
  backendNodeId: number
): Promise<{ x: number; y: number }> {
  await sendCdp(ws, 'DOM.enable');
  const box = (await sendCdp(ws, 'DOM.getBoxModel', { backendNodeId })) as {
    model?: { content?: number[] };
  };
  const c = box?.model?.content;
  if (!c || c.length < 8) throw new Error(`No box model for node ${backendNodeId}`);
  return { x: (c[0] + c[4]) / 2, y: (c[1] + c[5]) / 2 };
}

function resolveUidToBackendNodeId(targetId: string, uid: string): number | null {
  if (!isSnapshotUid(uid)) return null;
  return getBackendNodeIdByUid(targetId, uid);
}

const ts = () => Date.now() / 1000;

// --- click ---
const clickSchema = z
  .object({
    uid: z.string().optional().describe('take_snapshot에서 얻은 요소 uid 또는 CSS 선택자'),
    selector: z.string().optional().describe('CSS 선택자 (uid 대신 사용 가능, 하위 호환)'),
    dblClick: z.boolean().optional().default(false).describe('더블클릭 여부'),
    includeSnapshot: z.boolean().optional().describe('응답에 스냅샷 포함 (선택)'),
  })
  .refine((o) => o.uid != null || o.selector != null, { message: 'uid 또는 selector 필요' });

// --- hover ---
const hoverSchema = z.object({
  uid: z.string().describe('take_snapshot에서 얻은 요소 uid 또는 CSS 선택자'),
  includeSnapshot: z.boolean().optional().describe('응답에 스냅샷 포함 (선택)'),
});

// --- drag ---
const dragSchema = z.object({
  from_uid: z.string().describe('드래그할 요소 uid'),
  to_uid: z.string().describe('드롭할 대상 요소 uid'),
  includeSnapshot: z.boolean().optional().describe('응답에 스냅샷 포함 (선택)'),
});

// --- fill ---
const fillSchema = z.object({
  uid: z.string().describe('입력/텍스트/select 요소 uid'),
  value: z.string().describe('쓸 값 또는 select 옵션 텍스트'),
  includeSnapshot: z.boolean().optional().describe('응답에 스냅샷 포함 (선택)'),
});

// --- fill_form ---
const fillFormSchema = z.object({
  elements: z
    .array(z.object({ uid: z.string(), value: z.string() }))
    .describe('채울 요소들 { uid, value }'),
  includeSnapshot: z.boolean().optional().describe('응답에 스냅샷 포함 (선택)'),
});

// --- handle_dialog (주석 처리됨: Electron 리모트에서 미지원) ---
const _handleDialogSchema = z.object({
  action: z.enum(['accept', 'dismiss']).describe('accept 또는 dismiss'),
  promptText: z.string().optional().describe('prompt 시 입력할 텍스트'),
});

// --- press_key ---
const pressKeySchema = z.object({
  key: z
    .string()
    .describe(
      '키 또는 조합. 예: Enter, Control+A, Control+Shift+R. Modifiers: Control, Shift, Alt, Meta'
    ),
  includeSnapshot: z.boolean().optional().describe('응답에 스냅샷 포함 (선택)'),
});

// --- upload_file ---
const uploadFileSchema = z.object({
  uid: z.string().describe('파일 입력 요소 또는 파일 선택기를 여는 요소 uid'),
  filePath: z.string().describe('업로드할 파일 로컬 경로'),
  includeSnapshot: z.boolean().optional().describe('응답에 스냅샷 포함 (선택)'),
});

// 키 조합 파싱: "Control+A" -> { modifiers: number, key: string }
const MOD_MAP: Record<string, number> = {
  Alt: 1,
  Control: 2,
  Ctrl: 2,
  Meta: 4,
  Shift: 8,
};
function parseKeyCombination(keyInput: string): { modifiers: number; key: string } {
  const parts = keyInput.split('+').map((p) => p.trim());
  let modifiers = 0;
  const keys: string[] = [];
  for (const p of parts) {
    const mod = MOD_MAP[p];
    if (mod !== undefined) modifiers |= mod;
    else keys.push(p);
  }
  const key = keys.length ? keys[keys.length - 1]! : keyInput;
  return { modifiers, key };
}

// DOM 키 이름 -> CDP code/key (간단 매핑)
const KEY_TO_CODE: Record<string, string> = {
  Enter: 'Enter',
  Backspace: 'Backspace',
  Tab: 'Tab',
  Escape: 'Escape',
  Space: 'Space',
  ArrowLeft: 'ArrowLeft',
  ArrowRight: 'ArrowRight',
  ArrowUp: 'ArrowUp',
  ArrowDown: 'ArrowDown',
  Home: 'Home',
  End: 'End',
  PageUp: 'PageUp',
  PageDown: 'PageDown',
  Insert: 'Insert',
  Delete: 'Delete',
};
function keyToCode(key: string): string {
  if (KEY_TO_CODE[key]) return KEY_TO_CODE[key]!;
  if (key.length === 1) {
    const upper = key.toUpperCase();
    if (upper >= 'A' && upper <= 'Z') return `Key${upper}`;
    if (upper >= '0' && upper <= '9') return `Digit${upper}`;
  }
  return key;
}

export function registerInputTools(server: McpServer): void {
  const register = (
    name: string,
    description: string,
    inputSchema: z.ZodTypeAny,
    handler: (args: unknown) => Promise<{ content: Array<{ type: 'text'; text: string }> }>
  ) => {
    (
      server as {
        registerTool(
          name: string,
          def: { description: string; inputSchema: z.ZodTypeAny },
          handler: (args: unknown) => Promise<unknown>
        ): void;
      }
    ).registerTool(name, { description, inputSchema }, handler);
  };

  register(
    'click',
    '제공된 요소를 클릭합니다 (take_snapshot uid 또는 CSS 선택자).',
    clickSchema,
    async (args) => {
      const parsed = clickSchema.parse(args);
      const uid = parsed.uid ?? parsed.selector ?? '';
      const { dblClick } = parsed;
      const target = await findElectronTarget();
      await withCdpWs(target, async (ws) => {
        const { x, y } = await getCenterForUid(ws, target.id, uid);
        const t = ts();
        const count = dblClick ? 2 : 1;
        await sendCdp(ws, 'Input.dispatchMouseEvent', {
          type: 'mousePressed',
          x,
          y,
          button: 'left',
          clickCount: count,
          timestamp: t,
        });
        await sendCdp(ws, 'Input.dispatchMouseEvent', {
          type: 'mouseReleased',
          x,
          y,
          button: 'left',
          clickCount: count,
          timestamp: t,
        });
      });
      const msg = dblClick
        ? 'Successfully double clicked on the element'
        : 'Successfully clicked on the element';
      return { content: [{ type: 'text', text: msg }] };
    }
  );

  register('hover', '제공된 요소 위에 마우스를 올립니다.', hoverSchema, async (args) => {
    const { uid } = hoverSchema.parse(args);
    const target = await findElectronTarget();
    await withCdpWs(target, async (ws) => {
      const { x, y } = await getCenterForUid(ws, target.id, uid);
      await sendCdp(ws, 'Input.dispatchMouseEvent', {
        type: 'mouseMoved',
        x,
        y,
        timestamp: ts(),
      });
    });
    return { content: [{ type: 'text', text: 'Successfully hovered over the element' }] };
  });

  register(
    'drag',
    '한 요소를 다른 요소 위로 드래그합니다. CDP Input.dispatchDragEvent로 실제 drop 이벤트 전달 후 스냅샷으로 검증.',
    dragSchema,
    async (args) => {
      const { from_uid, to_uid, includeSnapshot } = dragSchema.parse(args);
      const target = await findElectronTarget();
      const dragData = {
        items: [{ mimeType: 'text/plain', data: 'demo' }],
        dragOperationsMask: 1,
      };
      await withCdpWs(target, async (ws) => {
        const from = await getCenterForUid(ws, target.id, from_uid);
        const to = await getCenterForUid(ws, target.id, to_uid);
        const t = ts();
        await sendCdp(ws, 'Input.dispatchMouseEvent', {
          type: 'mousePressed',
          x: from.x,
          y: from.y,
          button: 'left',
          clickCount: 1,
          timestamp: t,
        });
        await sendCdp(ws, 'Input.dispatchMouseEvent', {
          type: 'mouseMoved',
          x: to.x,
          y: to.y,
          timestamp: t,
        });
        try {
          await sendCdp(ws, 'Input.dispatchDragEvent', {
            type: 'dragEnter',
            x: to.x,
            y: to.y,
            data: dragData,
            modifiers: 0,
          });
          await sendCdp(ws, 'Input.dispatchDragEvent', {
            type: 'dragOver',
            x: to.x,
            y: to.y,
            data: dragData,
            modifiers: 0,
          });
          await sendCdp(ws, 'Input.dispatchDragEvent', {
            type: 'drop',
            x: to.x,
            y: to.y,
            data: dragData,
            modifiers: 0,
          });
        } catch {
          await sendCdp(ws, 'Input.dispatchMouseEvent', {
            type: 'mouseReleased',
            x: to.x,
            y: to.y,
            button: 'left',
            clickCount: 1,
            timestamp: ts(),
          });
        }
      });
      await new Promise((r) => setTimeout(r, 150));
      const verifyResult = await (async () => {
        const ws = await (async () => {
          const { WebSocket } = await import('ws');
          const t = await findElectronTarget();
          const w = new WebSocket(t.webSocketDebuggerUrl);
          await new Promise<void>((resolve, reject) => {
            w.once('open', () => resolve());
            w.once('error', reject);
          });
          return { ws: w, target };
        })();
        try {
          await sendCdp(ws.ws, 'Runtime.enable');
          const expr = `(function(){
          var main = document.querySelector('main');
          return main ? main.innerText : document.body.innerText;
        })()`;
          const r = (await sendCdp(ws.ws, 'Runtime.evaluate', {
            expression: expr,
            returnByValue: true,
          })) as { result?: { type?: string; value?: string } };
          const text = r?.result?.type === 'string' ? (r.result.value ?? '') : '';
          return text.includes('드롭 완료') || text.includes('드롭됨');
        } finally {
          ws.ws.close();
        }
      })();
      const lines = [
        verifyResult
          ? 'Successfully dragged an element'
          : 'Drag events sent but drop was not detected on page (드롭 완료 없음).',
      ];
      if (includeSnapshot) {
        const { takeSnapshotImpl } = await import('./snapshot.js');
        const { text } = await takeSnapshotImpl(target);
        lines.push('\n--- 스냅샷 ---\n' + text);
      }
      if (!verifyResult) {
        lines.push('\n(드롭 대상 요소의 onDrop이 호출되어야 "드롭 완료"가 표시됩니다.)');
      }
      return { content: [{ type: 'text', text: lines.join('') }] };
    }
  );

  register(
    'fill',
    'input/textarea에 텍스트를 입력하거나 select에서 옵션을 선택합니다.',
    fillSchema,
    async (args) => {
      const { uid, value } = fillSchema.parse(args);
      const target = await findElectronTarget();
      const backendNodeId = resolveUidToBackendNodeId(target.id, uid);
      await withCdpWs(target, async (ws) => {
        await sendCdp(ws, 'DOM.enable');
        await sendCdp(ws, 'Runtime.enable');
        if (backendNodeId != null) {
          await sendCdp(ws, 'DOM.focus', { backendNodeId });
        } else {
          const expr = `(function(sel){
            var el = document.querySelector(sel);
            if(el) el.focus();
            return el ? true : false;
          })(${JSON.stringify(uid)})`;
          const r = (await sendCdp(ws, 'Runtime.evaluate', {
            expression: expr,
            returnByValue: true,
          })) as {
            result?: { value?: boolean };
          };
          if (!r?.result?.value) throw new Error(`Element not found: ${uid}`);
        }
        await sendCdp(ws, 'Input.insertText', { text: value });
      });
      return { content: [{ type: 'text', text: 'Successfully filled out the element' }] };
    }
  );

  register('fill_form', '여러 폼 필드를 한 번에 채웁니다.', fillFormSchema, async (args) => {
    const { elements } = fillFormSchema.parse(args);
    const target = await findElectronTarget();
    for (const { uid, value } of elements) {
      const backendNodeId = resolveUidToBackendNodeId(target.id, uid);
      await withCdpWs(target, async (ws) => {
        await sendCdp(ws, 'DOM.enable');
        await sendCdp(ws, 'Runtime.enable');
        if (backendNodeId != null) {
          await sendCdp(ws, 'DOM.focus', { backendNodeId });
        } else {
          const expr = `(function(sel){
            var el = document.querySelector(sel);
            if(el) el.focus();
            return el ? true : false;
          })(${JSON.stringify(uid)})`;
          const r = (await sendCdp(ws, 'Runtime.evaluate', {
            expression: expr,
            returnByValue: true,
          })) as {
            result?: { value?: boolean };
          };
          if (!r?.result?.value) throw new Error(`Element not found: ${uid}`);
        }
        await sendCdp(ws, 'Input.insertText', { text: value });
      });
    }
    return { content: [{ type: 'text', text: 'Successfully filled out the form' }] };
  });

  // handle_dialog: Electron 리모트 디버깅에서는 네이티브 다이얼로그가 CDP와 연동되지 않아
  // Page.handleJavaScriptDialog가 동작하지 않음. 지원 스펙에서 제외.
  // register(
  //   'handle_dialog',
  //   '...',
  //   handleDialogSchema,
  //   async (args) => { ... }
  // );

  register(
    'press_key',
    '키 또는 키 조합을 누릅니다 (단축키, 내비게이션 키 등). fill()로 불가할 때 사용.',
    pressKeySchema,
    async (args) => {
      const { key } = pressKeySchema.parse(args);
      const target = await findElectronTarget();
      const { modifiers, key: keyName } = parseKeyCombination(key);
      const code = keyToCode(keyName);
      await withCdpWs(target, async (ws) => {
        const t = ts();
        await sendCdp(ws, 'Input.dispatchKeyEvent', {
          type: 'keyDown',
          key: keyName,
          code,
          modifiers,
          timestamp: t,
        });
        await sendCdp(ws, 'Input.dispatchKeyEvent', {
          type: 'keyUp',
          key: keyName,
          code,
          modifiers,
          timestamp: t,
        });
      });
      return { content: [{ type: 'text', text: `Successfully pressed key: ${key}` }] };
    }
  );

  register(
    'upload_file',
    '지정 요소를 통해 파일을 업로드합니다.',
    uploadFileSchema,
    async (args) => {
      const { uid, filePath } = uploadFileSchema.parse(args);
      const target = await findElectronTarget();
      const backendNodeId = resolveUidToBackendNodeId(target.id, uid);
      await withCdpWs(target, async (ws) => {
        await sendCdp(ws, 'DOM.enable');
        if (backendNodeId != null) {
          try {
            await sendCdp(ws, 'DOM.setFileInputFiles', { backendNodeId, files: [filePath] });
          } catch {
            const { x, y } = await getCenterByBackendNodeId(ws, backendNodeId);
            const t = ts();
            await sendCdp(ws, 'Input.dispatchMouseEvent', {
              type: 'mousePressed',
              x,
              y,
              button: 'left',
              clickCount: 1,
              timestamp: t,
            });
            await sendCdp(ws, 'Input.dispatchMouseEvent', {
              type: 'mouseReleased',
              x,
              y,
              button: 'left',
              clickCount: 1,
              timestamp: t,
            });
            await sendCdp(ws, 'DOM.setFileInputFiles', { backendNodeId, files: [filePath] });
          }
        } else {
          const doc = (await sendCdp(ws, 'DOM.getDocument', { depth: -1 })) as {
            root?: { nodeId?: number };
          };
          const rootId = doc?.root?.nodeId;
          if (rootId == null) throw new Error('DOM.getDocument failed');
          const query = (await sendCdp(ws, 'DOM.querySelector', {
            nodeId: rootId,
            selector: uid,
          })) as { nodeId?: number };
          const nodeId = query?.nodeId;
          if (nodeId == null || nodeId === 0) throw new Error(`Element not found: ${uid}`);
          await sendCdp(ws, 'DOM.setFileInputFiles', { nodeId, files: [filePath] });
        }
      });
      return { content: [{ type: 'text', text: `File uploaded from ${filePath}.` }] };
    }
  );
}
