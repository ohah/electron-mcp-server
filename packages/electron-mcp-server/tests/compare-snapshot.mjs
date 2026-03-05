/**
 * rc4 (JSON) vs dev (compact) 스냅샷 토큰 비교 스크립트.
 * 데모 앱이 --remote-debugging-port=9222 로 실행 중이어야 합니다.
 */
import { WebSocket } from 'ws';
import http from 'node:http';

const PORT = 9222;

function fetchJSON(urlPath) {
  return new Promise((resolve, reject) => {
    http.get(`http://localhost:${PORT}${urlPath}`, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => resolve(JSON.parse(data)));
      res.on('error', reject);
    });
  });
}

function sendCdp(ws, method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = Math.floor(Math.random() * 1e9);
    ws.send(JSON.stringify({ id, method, params }));
    const handler = (msg) => {
      const parsed = JSON.parse(msg.toString());
      if (parsed.id === id) {
        ws.off('message', handler);
        if (parsed.error) reject(new Error(JSON.stringify(parsed.error)));
        else resolve(parsed.result);
      }
    };
    ws.on('message', handler);
  });
}

// ---- rc4 style: raw JSON output ----
function formatRc4(nodes) {
  return JSON.stringify(nodes, null, 2);
}

// ---- dev style: compact text output (mirrors snapshot.ts) ----
const INTERACTIVE_ROLES = new Set([
  'button',
  'link',
  'textbox',
  'checkbox',
  'radio',
  'combobox',
  'listbox',
  'menuitem',
  'menuitemcheckbox',
  'menuitemradio',
  'option',
  'searchbox',
  'slider',
  'spinbutton',
  'switch',
  'tab',
  'treeitem',
]);
const CONTENT_ROLES = new Set([
  'heading',
  'cell',
  'gridcell',
  'columnheader',
  'rowheader',
  'listitem',
  'article',
  'region',
  'main',
  'navigation',
]);
const STRUCTURAL_ROLES = new Set([
  'generic',
  'group',
  'list',
  'table',
  'row',
  'rowgroup',
  'grid',
  'treegrid',
  'menu',
  'menubar',
  'toolbar',
  'tablist',
  'tree',
  'directory',
  'document',
  'application',
  'presentation',
  'none',
]);

let refCounter = 0;

function formatNode(node, nodesById, depth, options) {
  if (node.ignored) {
    const childLines = [];
    for (const cid of node.childIds ?? []) {
      const child = nodesById.get(cid);
      if (child) childLines.push(...formatNode(child, nodesById, depth, options));
    }
    return childLines;
  }
  if (options.maxDepth !== undefined && depth > options.maxDepth) return [];

  const role = node.role?.value ?? '';
  const roleLower = role.toLowerCase();
  const name = (node.name?.value ?? '').trim();
  const rawValue = node.value?.value;
  const value = typeof rawValue === 'string' ? rawValue.trim() : '';
  const backendNodeId = node.backendDOMNodeId;

  const isInteractive = INTERACTIVE_ROLES.has(roleLower);
  const isContent = CONTENT_ROLES.has(roleLower);
  const isStructural = STRUCTURAL_ROLES.has(roleLower);

  if (options.interactive && !isInteractive && depth > 0) {
    const childLines = [];
    for (const cid of node.childIds ?? []) {
      const child = nodesById.get(cid);
      if (child) childLines.push(...formatNode(child, nodesById, depth, options));
    }
    return childLines;
  }

  if (options.compact && isStructural && !name) {
    const childLines = [];
    for (const cid of node.childIds ?? []) {
      const child = nodesById.get(cid);
      if (child) childLines.push(...formatNode(child, nodesById, depth, options));
    }
    return childLines;
  }

  const shouldHaveRef = (isInteractive || (isContent && name)) && backendNodeId != null;
  const indent = '  '.repeat(depth);
  let line = `${indent}- ${role}`;
  if (name) line += ` "${name}"`;

  if (shouldHaveRef) {
    refCounter++;
    line += ` [ref=e${refCounter}]`;
  }

  if (value) line += ` value="${value}"`;

  const levelProp = node.properties?.find((p) => p.name === 'level');
  if (levelProp?.value?.value != null) {
    line += ` [level=${levelProp.value.value}]`;
  }

  const out = [];
  if (line.trim() !== `- ${role}` || shouldHaveRef) {
    out.push(line);
  }

  for (const cid of node.childIds ?? []) {
    const child = nodesById.get(cid);
    if (child) out.push(...formatNode(child, nodesById, depth + 1, options));
  }

  return out;
}

function formatDev(nodes, options = {}) {
  refCounter = 0;
  const nodesById = new Map();
  for (const n of nodes) {
    if (n.nodeId) nodesById.set(n.nodeId, n);
  }
  const root = nodes.find((n) => n.role?.value === 'RootWebArea') ?? nodes[0];
  if (!root) return '(empty)';
  const lines = formatNode(root, nodesById, 0, options);
  return lines.length > 0 ? lines.join('\n') : '(empty)';
}

// ---- main ----
async function main() {
  const targets = await fetchJSON('/json');
  const target = targets.find(
    (t) => t.type === 'page' && t.url && !t.url.startsWith('devtools://')
  );
  if (!target) {
    console.error('No page target found');
    process.exit(1);
  }

  console.log(`Target: ${target.title} (${target.url})\n`);

  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.once('open', resolve);
    ws.once('error', reject);
  });

  const ax = await sendCdp(ws, 'Accessibility.getFullAXTree');
  const nodes = ax?.nodes ?? [];
  ws.close();

  console.log(`Total AX nodes: ${nodes.length}`);
  console.log(`Ignored nodes: ${nodes.filter((n) => n.ignored).count}\n`);

  // rc4 style (full JSON)
  const rc4Full = formatRc4(nodes);

  // dev styles
  const devFull = formatDev(nodes, {});
  const devCompact = formatDev(nodes, { compact: true });
  const devInteractive = formatDev(nodes, { interactive: true });
  const devCompactInteractive = formatDev(nodes, { compact: true, interactive: true });

  const results = [
    ['rc4 (full JSON)', rc4Full],
    ['dev (full tree)', devFull],
    ['dev (compact)', devCompact],
    ['dev (interactive)', devInteractive],
    ['dev (compact+interactive)', devCompactInteractive],
  ];

  console.log('='.repeat(60));
  console.log('Snapshot Token Comparison');
  console.log('='.repeat(60));

  const baseChars = rc4Full.length;
  for (const [label, text] of results) {
    const chars = text.length;
    const lines = text.split('\n').length;
    const reduction = ((1 - chars / baseChars) * 100).toFixed(1);
    console.log(`\n${label}:`);
    console.log(`  chars: ${chars.toLocaleString()}  lines: ${lines}  reduction: ${reduction}%`);
  }

  // Show sample of dev compact output
  console.log('\n' + '='.repeat(60));
  console.log('Sample: dev (compact) - first 50 lines');
  console.log('='.repeat(60));
  console.log(devCompact.split('\n').slice(0, 50).join('\n'));
}

main().catch(console.error);
