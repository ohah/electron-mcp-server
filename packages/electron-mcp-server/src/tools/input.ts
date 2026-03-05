/**
 * 입력·자동화 (Input automation) — @ref 기반 (agent-browser 스타일)
 * click, drag, fill, fill_form, hover, press_key, upload_file
 * ref: @e1 형태 (take_snapshot에서 생성), CSS 선택자도 폴백 지원.
 */

import { z } from 'zod';
import { WebSocket } from 'ws';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { findElectronTarget, sendCdp, withCdpWs } from './electron';
import { parseRef, getElementRef } from './ref-store';

/** ref(@e1) → backendNodeId, CSS 선택자 → querySelector */
async function getCenterForSelector(
  ws: WebSocket,
  selector: string
): Promise<{ x: number; y: number }> {
  // 1) ref 시도
  const ref = parseRef(selector);
  if (ref) {
    const data = getElementRef(ref);
    if (data) {
      await sendCdp(ws, 'DOM.enable');
      const box = (await sendCdp(ws, 'DOM.getBoxModel', { backendNodeId: data.backendNodeId })) as {
        model?: { content?: number[] };
      };
      const c = box?.model?.content;
      if (c && c.length >= 8) {
        return { x: (c[0] + c[4]) / 2, y: (c[1] + c[5]) / 2 };
      }
    }
    throw new Error(`Ref "${selector}" not found. Run take_snapshot to get updated refs.`);
  }

  // 2) CSS 선택자 폴백
  await sendCdp(ws, 'Runtime.enable');
  const expr = `(function(s){
    var el = document.querySelector(s);
    if(!el) return null;
    var r = el.getBoundingClientRect();
    return { x: r.left + r.width/2, y: r.top + r.height/2 };
  })(${JSON.stringify(selector)})`;
  const evalResult = (await sendCdp(ws, 'Runtime.evaluate', {
    expression: expr,
    returnByValue: true,
  })) as { result?: { type?: string; value?: { x: number; y: number } } };
  const coord = evalResult?.result?.type === 'object' ? evalResult.result.value : null;
  if (!coord || typeof coord.x !== 'number' || typeof coord.y !== 'number') {
    throw new Error(`Element not found: ${selector}. Run take_snapshot to see available elements.`);
  }
  return { x: coord.x, y: coord.y };
}

/** ref → backendNodeId (focus용) */
function resolveToBackendNodeId(selector: string): number | null {
  const ref = parseRef(selector);
  if (!ref) return null;
  return getElementRef(ref)?.backendNodeId ?? null;
}

const ts = () => Date.now() / 1000;

// --- schemas ---
const clickSchema = z.object({
  ref: z.string().describe('Element ref from take_snapshot (@e1) or CSS selector'),
  dblClick: z.boolean().optional().default(false).describe('Double-click'),
});

const hoverSchema = z.object({
  ref: z.string().describe('Element ref (@e1) or CSS selector'),
});

const dragSchema = z.object({
  from: z.string().describe('Source element ref (@e1)'),
  to: z.string().describe('Target element ref (@e2)'),
});

const fillSchema = z.object({
  ref: z.string().describe('Input element ref (@e1) or CSS selector'),
  value: z.string().describe('Value to set'),
});

const fillFormSchema = z.object({
  fields: z.array(z.object({ ref: z.string(), value: z.string() }))
    .describe('Fields to fill: [{ ref: "@e1", value: "text" }]'),
});

const pressKeySchema = z.object({
  key: z.string().describe('Key or combination: Enter, Control+A, Control+Shift+R'),
});

const uploadFileSchema = z.object({
  ref: z.string().describe('File input element ref (@e1)'),
  filePath: z.string().describe('Local file path'),
});

// 키 조합 파싱
const MOD_MAP: Record<string, number> = { Alt: 1, Control: 2, Ctrl: 2, Meta: 4, Shift: 8 };
function parseKeyCombination(keyInput: string): { modifiers: number; key: string } {
  const parts = keyInput.split('+').map((p) => p.trim());
  let modifiers = 0;
  const keys: string[] = [];
  for (const p of parts) {
    const mod = MOD_MAP[p];
    if (mod !== undefined) modifiers |= mod;
    else keys.push(p);
  }
  return { modifiers, key: keys.length ? keys[keys.length - 1]! : keyInput };
}

const KEY_TO_CODE: Record<string, string> = {
  Enter: 'Enter', Backspace: 'Backspace', Tab: 'Tab', Escape: 'Escape',
  Space: 'Space', ArrowLeft: 'ArrowLeft', ArrowRight: 'ArrowRight',
  ArrowUp: 'ArrowUp', ArrowDown: 'ArrowDown', Home: 'Home', End: 'End',
  PageUp: 'PageUp', PageDown: 'PageDown', Insert: 'Insert', Delete: 'Delete',
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
    (server as {
      registerTool(name: string, def: { description: string; inputSchema: z.ZodTypeAny }, handler: (args: unknown) => Promise<unknown>): void;
    }).registerTool(name, { description, inputSchema }, handler);
  };

  register(
    'click',
    'Click element by ref (@e1 from take_snapshot) or CSS selector.',
    clickSchema,
    async (args) => {
      const { ref, dblClick } = clickSchema.parse(args);
      const target = await findElectronTarget();
      await withCdpWs(target, async (ws) => {
        const { x, y } = await getCenterForSelector(ws, ref);
        const t = ts();
        const count = dblClick ? 2 : 1;
        await sendCdp(ws, 'Input.dispatchMouseEvent', {
          type: 'mousePressed', x, y, button: 'left', clickCount: count, timestamp: t,
        });
        await sendCdp(ws, 'Input.dispatchMouseEvent', {
          type: 'mouseReleased', x, y, button: 'left', clickCount: count, timestamp: t,
        });
      });
      return { content: [{ type: 'text', text: dblClick ? 'Double-clicked' : 'Clicked' }] };
    }
  );

  register(
    'hover',
    'Hover over element by ref (@e1) or CSS selector.',
    hoverSchema,
    async (args) => {
      const { ref } = hoverSchema.parse(args);
      const target = await findElectronTarget();
      await withCdpWs(target, async (ws) => {
        const { x, y } = await getCenterForSelector(ws, ref);
        await sendCdp(ws, 'Input.dispatchMouseEvent', {
          type: 'mouseMoved', x, y, timestamp: ts(),
        });
      });
      return { content: [{ type: 'text', text: 'Hovered' }] };
    }
  );

  register(
    'drag',
    'Drag element from ref to ref.',
    dragSchema,
    async (args) => {
      const { from, to } = dragSchema.parse(args);
      const target = await findElectronTarget();
      const dragData = { items: [{ mimeType: 'text/plain', data: 'demo' }], dragOperationsMask: 1 };
      await withCdpWs(target, async (ws) => {
        const fromPos = await getCenterForSelector(ws, from);
        const toPos = await getCenterForSelector(ws, to);
        const t = ts();
        await sendCdp(ws, 'Input.dispatchMouseEvent', {
          type: 'mousePressed', x: fromPos.x, y: fromPos.y, button: 'left', clickCount: 1, timestamp: t,
        });
        await sendCdp(ws, 'Input.dispatchMouseEvent', {
          type: 'mouseMoved', x: toPos.x, y: toPos.y, timestamp: t,
        });
        try {
          await sendCdp(ws, 'Input.dispatchDragEvent', { type: 'dragEnter', x: toPos.x, y: toPos.y, data: dragData, modifiers: 0 });
          await sendCdp(ws, 'Input.dispatchDragEvent', { type: 'dragOver', x: toPos.x, y: toPos.y, data: dragData, modifiers: 0 });
          await sendCdp(ws, 'Input.dispatchDragEvent', { type: 'drop', x: toPos.x, y: toPos.y, data: dragData, modifiers: 0 });
        } catch {
          await sendCdp(ws, 'Input.dispatchMouseEvent', {
            type: 'mouseReleased', x: toPos.x, y: toPos.y, button: 'left', clickCount: 1, timestamp: ts(),
          });
        }
      });
      return { content: [{ type: 'text', text: 'Dragged' }] };
    }
  );

  register(
    'fill',
    'Type text into input/textarea by ref (@e1) or CSS selector.',
    fillSchema,
    async (args) => {
      const { ref, value } = fillSchema.parse(args);
      const target = await findElectronTarget();
      const backendNodeId = resolveToBackendNodeId(ref);
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
          })(${JSON.stringify(ref)})`;
          const r = (await sendCdp(ws, 'Runtime.evaluate', {
            expression: expr, returnByValue: true,
          })) as { result?: { value?: boolean } };
          if (!r?.result?.value) throw new Error(`Element not found: ${ref}`);
        }
        await sendCdp(ws, 'Input.insertText', { text: value });
      });
      return { content: [{ type: 'text', text: 'Filled' }] };
    }
  );

  register(
    'fill_form',
    'Fill multiple form fields at once by ref.',
    fillFormSchema,
    async (args) => {
      const { fields } = fillFormSchema.parse(args);
      const target = await findElectronTarget();
      for (const { ref, value } of fields) {
        const backendNodeId = resolveToBackendNodeId(ref);
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
            })(${JSON.stringify(ref)})`;
            const r = (await sendCdp(ws, 'Runtime.evaluate', {
              expression: expr, returnByValue: true,
            })) as { result?: { value?: boolean } };
            if (!r?.result?.value) throw new Error(`Element not found: ${ref}`);
          }
          await sendCdp(ws, 'Input.insertText', { text: value });
        });
      }
      return { content: [{ type: 'text', text: `Filled ${fields.length} fields` }] };
    }
  );

  register(
    'press_key',
    'Press a key or combination: Enter, Control+A, etc.',
    pressKeySchema,
    async (args) => {
      const { key } = pressKeySchema.parse(args);
      const target = await findElectronTarget();
      const { modifiers, key: keyName } = parseKeyCombination(key);
      const code = keyToCode(keyName);
      await withCdpWs(target, async (ws) => {
        const t = ts();
        await sendCdp(ws, 'Input.dispatchKeyEvent', {
          type: 'keyDown', key: keyName, code, modifiers, timestamp: t,
        });
        await sendCdp(ws, 'Input.dispatchKeyEvent', {
          type: 'keyUp', key: keyName, code, modifiers, timestamp: t,
        });
      });
      return { content: [{ type: 'text', text: `Pressed ${key}` }] };
    }
  );

  register(
    'upload_file',
    'Upload a file through element by ref (@e1).',
    uploadFileSchema,
    async (args) => {
      const { ref, filePath } = uploadFileSchema.parse(args);
      const target = await findElectronTarget();
      const backendNodeId = resolveToBackendNodeId(ref);
      await withCdpWs(target, async (ws) => {
        await sendCdp(ws, 'DOM.enable');
        if (backendNodeId != null) {
          try {
            await sendCdp(ws, 'DOM.setFileInputFiles', { backendNodeId, files: [filePath] });
          } catch {
            const { x, y } = await getCenterForSelector(ws, ref);
            const t = ts();
            await sendCdp(ws, 'Input.dispatchMouseEvent', {
              type: 'mousePressed', x, y, button: 'left', clickCount: 1, timestamp: t,
            });
            await sendCdp(ws, 'Input.dispatchMouseEvent', {
              type: 'mouseReleased', x, y, button: 'left', clickCount: 1, timestamp: t,
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
            nodeId: rootId, selector: ref,
          })) as { nodeId?: number };
          const nodeId = query?.nodeId;
          if (nodeId == null || nodeId === 0) throw new Error(`Element not found: ${ref}`);
          await sendCdp(ws, 'DOM.setFileInputFiles', { nodeId, files: [filePath] });
        }
      });
      return { content: [{ type: 'text', text: `Uploaded ${filePath}` }] };
    }
  );
}
