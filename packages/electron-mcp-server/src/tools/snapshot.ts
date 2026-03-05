/**
 * take_snapshot — agent-browser 스타일 compact ref 기반 a11y 스냅샷.
 * CDP Accessibility.getFullAXTree 사용. 각 요소에 [ref=e1] 형태의 짧은 ref 부여.
 * 옵션: interactive (인터랙티브만), compact (구조 제거), maxDepth (깊이 제한).
 */

import { z } from 'zod';
import { WebSocket } from 'ws';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { findElectronTarget, sendCdp, type DevToolsTarget } from './electron';
import { resetElementRefs, addElementRef, type ElementRef } from './ref-store';

const INTERACTIVE_ROLES = new Set([
  'button', 'link', 'textbox', 'checkbox', 'radio', 'combobox', 'listbox',
  'menuitem', 'menuitemcheckbox', 'menuitemradio', 'option', 'searchbox',
  'slider', 'spinbutton', 'switch', 'tab', 'treeitem',
]);

const CONTENT_ROLES = new Set([
  'heading', 'cell', 'gridcell', 'columnheader', 'rowheader',
  'listitem', 'article', 'region', 'main', 'navigation',
]);

const STRUCTURAL_ROLES = new Set([
  'generic', 'group', 'list', 'table', 'row', 'rowgroup',
  'grid', 'treegrid', 'menu', 'menubar', 'toolbar', 'tablist',
  'tree', 'directory', 'document', 'application', 'presentation', 'none',
]);

interface AXNode {
  nodeId?: string;
  ignored?: boolean;
  role?: { type?: string; value?: string };
  name?: { type?: string; value?: string };
  value?: { type?: string; value?: string };
  backendDOMNodeId?: number;
  childIds?: string[];
  properties?: Array<{ name: string; value?: { type?: string; value?: unknown } }>;
}

interface SnapshotOptions {
  interactive?: boolean;
  compact?: boolean;
  maxDepth?: number;
}

interface RoleNameTracker {
  counts: Map<string, number>;
  refsByKey: Map<string, string[]>;
}

function createTracker(): RoleNameTracker {
  return { counts: new Map(), refsByKey: new Map() };
}

function trackAndGetNth(tracker: RoleNameTracker, role: string, name: string, ref: string): number {
  const key = `${role}:${name}`;
  const current = tracker.counts.get(key) ?? 0;
  tracker.counts.set(key, current + 1);
  const refs = tracker.refsByKey.get(key) ?? [];
  refs.push(ref);
  tracker.refsByKey.set(key, refs);
  return current;
}

function removeNthFromNonDuplicates(tracker: RoleNameTracker): void {
  const duplicateKeys = new Set<string>();
  for (const [key, refs] of tracker.refsByKey) {
    if (refs.length > 1) duplicateKeys.add(key);
  }
  // nth is only relevant when there are duplicates - handled in addElementRef
}

function formatNode(
  node: AXNode,
  nodesById: Map<string, AXNode>,
  depth: number,
  options: SnapshotOptions,
  tracker: RoleNameTracker,
): string[] {
  // ignored 노드는 건너뛰되, 자식은 처리 (트리가 잘리지 않도록)
  if (node.ignored) {
    const childLines: string[] = [];
    for (const cid of node.childIds ?? []) {
      const child = nodesById.get(cid);
      if (child) childLines.push(...formatNode(child, nodesById, depth, options, tracker));
    }
    return childLines;
  }
  if (options.maxDepth !== undefined && depth > options.maxDepth) return [];

  const role = node.role?.value ?? '';
  const roleLower = role.toLowerCase();
  const name = typeof node.name?.value === 'string' ? node.name.value.trim() : '';
  const rawValue = node.value?.value;
  const value = typeof rawValue === 'string' ? rawValue.trim() : '';
  const backendNodeId = node.backendDOMNodeId;

  const isInteractive = INTERACTIVE_ROLES.has(roleLower);
  const isContent = CONTENT_ROLES.has(roleLower);
  const isStructural = STRUCTURAL_ROLES.has(roleLower);

  // interactive 모드: 인터랙티브 요소만
  if (options.interactive && !isInteractive && depth > 0) {
    // 자식에서 인터랙티브 요소를 찾아야 함
    const childLines: string[] = [];
    for (const cid of node.childIds ?? []) {
      const child = nodesById.get(cid);
      if (child) childLines.push(...formatNode(child, nodesById, depth, options, tracker));
    }
    return childLines;
  }

  // compact 모드: 무명 structural 요소 건너뛰기
  if (options.compact && isStructural && !name) {
    const childLines: string[] = [];
    for (const cid of node.childIds ?? []) {
      const child = nodesById.get(cid);
      if (child) childLines.push(...formatNode(child, nodesById, depth, options, tracker));
    }
    return childLines;
  }

  const shouldHaveRef = (isInteractive || (isContent && name)) && backendNodeId != null;

  const indent = '  '.repeat(depth);
  let line = `${indent}- ${role}`;
  if (name) line += ` "${name}"`;

  if (shouldHaveRef && backendNodeId != null) {
    const refData: ElementRef = { backendNodeId, role: roleLower, name };
    const ref = addElementRef(refData);
    const nth = trackAndGetNth(tracker, roleLower, name, ref);
    if (nth > 0) refData.nth = nth;
    line += ` [ref=${ref}]`;
    if (nth > 0) line += ` [nth=${nth}]`;
  }

  if (value) line += ` value="${value}"`;

  // level 속성 (heading)
  const levelProp = node.properties?.find(p => p.name === 'level');
  if (levelProp?.value?.value != null) {
    line += ` [level=${levelProp.value.value}]`;
  }

  const out: string[] = [];
  if (line.trim() !== `- ${role}` || shouldHaveRef) {
    out.push(line);
  }

  for (const cid of node.childIds ?? []) {
    const child = nodesById.get(cid);
    if (child) out.push(...formatNode(child, nodesById, depth + 1, options, tracker));
  }

  return out;
}

export async function takeSnapshotImpl(
  target: DevToolsTarget,
  options: SnapshotOptions = {}
): Promise<{ text: string; targetId: string }> {
  resetElementRefs();

  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise<void>((resolve, reject) => {
    ws.once('open', () => resolve());
    ws.once('error', reject);
  });

  try {
    const ax = (await sendCdp(ws, 'Accessibility.getFullAXTree')) as { nodes?: AXNode[] };
    const nodes = ax?.nodes ?? [];
    const nodesById = new Map<string, AXNode>();
    for (const n of nodes) {
      if (n.nodeId) nodesById.set(n.nodeId, n);
    }

    const root = nodes.find((n) => n.role?.value === 'RootWebArea') ?? nodes[0];
    if (!root) return { text: '(empty)', targetId: target.id };

    const tracker = createTracker();
    const lines = formatNode(root, nodesById, 0, options, tracker);
    removeNthFromNonDuplicates(tracker);

    const text = lines.length > 0 ? lines.join('\n') : '(empty)';
    return { text, targetId: target.id };
  } finally {
    ws.close();
  }
}

/**
 * 입력 도구에서 사용. ref → backendNodeId 변환.
 * ref-store에서 조회.
 */
export { getElementRef } from './ref-store';

const takeSnapshotSchema = z.object({
  interactive: z.boolean().optional().describe('Only show interactive elements (buttons, links, inputs). Saves tokens.'),
  compact: z.boolean().optional().describe('Remove empty structural elements. Saves tokens.'),
  maxDepth: z.number().optional().describe('Maximum tree depth to include (0 = root only).'),
});

export function registerTakeSnapshot(server: McpServer): void {
  (
    server as {
      registerTool(
        name: string,
        def: { description: string; inputSchema: z.ZodTypeAny },
        handler: (args: unknown) => Promise<unknown>
      ): void;
    }
  ).registerTool(
    'take_snapshot',
    {
      description:
        'Page snapshot from a11y tree. Each interactive element gets a ref (e.g. @e1). Use ref in click, fill, hover, etc. Options: interactive (interactive only), compact (remove structural noise), maxDepth (limit depth).',
      inputSchema: takeSnapshotSchema,
    },
    async (args) => {
      const params = takeSnapshotSchema.parse(args ?? {});
      const target = await findElectronTarget();
      const { text, targetId } = await takeSnapshotImpl(target, {
        interactive: params.interactive,
        compact: params.compact,
        maxDepth: params.maxDepth,
      });
      return {
        content: [
          {
            type: 'text' as const,
            text: `Snapshot (target=${targetId}). Use @ref in input tools.\n\n${text}`,
          },
        ],
      };
    }
  );
}
