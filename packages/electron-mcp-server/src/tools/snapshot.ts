/**
 * take_snapshot — a11y 트리 기반 페이지 텍스트 스냅샷(uid 부여).
 * Chrome DevTools MCP take_snapshot 스펙. CDP Accessibility.getFullAXTree 사용.
 * uid = backendDOMNodeId 문자열. 입력 도구(click, fill 등)에서 uid로 요소 해석.
 * @see https://github.com/ohah/electron-mcp-server/issues/3
 */

import { z } from 'zod';
import { WebSocket } from 'ws';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { findElectronTarget, sendCdp, type DevToolsTarget } from './electron';

/** 현재 타겟별 스냅샷 uid → backendNodeId. 입력 도구에서 사용. */
const uidToBackendNodeIdByTarget = new Map<string, Map<string, number>>();

function getStoreForTarget(targetId: string): Map<string, number> {
  let m = uidToBackendNodeIdByTarget.get(targetId);
  if (!m) {
    m = new Map();
    uidToBackendNodeIdByTarget.set(targetId, m);
  }
  return m;
}

/**
 * 입력 도구에서 사용. take_snapshot으로 얻은 uid에 해당하는 backendNodeId 반환.
 * 해당 타겟에 대한 스냅샷이 없으면 null.
 */
export function getBackendNodeIdByUid(targetId: string, uid: string): number | null {
  const m = uidToBackendNodeIdByTarget.get(targetId);
  if (!m) return null;
  const id = m.get(uid);
  return id ?? null;
}

export function getUidToBackendNodeIdMap(targetId: string): Map<string, number> | undefined {
  return uidToBackendNodeIdByTarget.get(targetId);
}

interface AXNode {
  nodeId?: string;
  ignored?: boolean;
  role?: { type?: string; value?: string };
  name?: { type?: string; value?: string };
  value?: { type?: string; value?: string };
  backendDOMNodeId?: number;
  childIds?: string[];
}

function formatNode(node: AXNode, nodesById: Map<string, AXNode>, depth: number): string {
  if (node.ignored) return '';
  const uid = node.backendDOMNodeId != null ? String(node.backendDOMNodeId) : '';
  const role = node.role?.value ?? '';
  const name = (node.name?.value ?? '').trim();
  const value = (node.value?.value ?? '').trim();
  const parts = [uid, role, name, value].filter(Boolean);
  const line =
    '  '.repeat(depth) +
    (parts.length
      ? `[uid=${uid}] ${role}${name ? ` "${name}"` : ''}${value ? ` value="${value}"` : ''}`
      : '');
  const out: string[] = [];
  if (line.trim()) out.push(line);
  for (const cid of node.childIds ?? []) {
    const child = nodesById.get(cid);
    if (child) {
      const sub = formatNode(child, nodesById, depth + 1);
      if (sub) out.push(sub);
    }
  }
  return out.join('\n');
}

/** 입력 도구(drag 등)에서 includeSnapshot 시 사용. 동일 타겟에 대한 스냅샷 텍스트 반환. */
export async function takeSnapshotImpl(
  target: DevToolsTarget
): Promise<{ text: string; targetId: string }> {
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  const store = getStoreForTarget(target.id);
  store.clear();

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
      if (n.backendDOMNodeId != null) {
        store.set(String(n.backendDOMNodeId), n.backendDOMNodeId);
      }
    }
    const root = nodes.find((n) => n.role?.value === 'RootWebArea') ?? nodes[0];
    const text = root ? formatNode(root, nodesById, 0) : '(empty tree)';
    return { text, targetId: target.id };
  } finally {
    ws.close();
  }
}

const takeSnapshotSchema = z.object({});

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
        'a11y 트리 기반 페이지 텍스트 스냅샷. 각 요소에 uid(backendNodeId)가 부여되며, click/fill 등 입력 도구에서 사용.',
      inputSchema: takeSnapshotSchema,
    },
    async () => {
      const target = await findElectronTarget();
      const { text, targetId } = await takeSnapshotImpl(target);
      return {
        content: [
          {
            type: 'text' as const,
            text: `Snapshot for page (targetId=${targetId}). Use uid in input tools.\n\n${text}`,
          },
        ],
      };
    }
  );
}
