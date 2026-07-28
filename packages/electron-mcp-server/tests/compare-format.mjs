import { WebSocket } from 'ws';
import http from 'node:http';

function fetchJSON(path) {
  return new Promise((resolve) => {
    http.get('http://localhost:9222' + path, (res) => {
      let d = '';
      res.on('data', (c) => (d += c));
      res.on('end', () => resolve(JSON.parse(d)));
    });
  });
}
function sendCdp(ws, method, params = {}) {
  return new Promise((resolve) => {
    const id = Math.floor(Math.random() * 1e9);
    ws.send(JSON.stringify({ id, method, params }));
    ws.on('message', function h(msg) {
      const p = JSON.parse(msg.toString());
      if (p.id === id) {
        ws.off('message', h);
        resolve(p.result);
      }
    });
  });
}

async function main() {
  const targets = await fetchJSON('/json');
  const t = targets.find((x) => x.type === 'page' && x.url && x.url.indexOf('devtools://') === -1);
  const ws = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise((r) => ws.once('open', r));

  const ax = await sendCdp(ws, 'Accessibility.getFullAXTree');
  const nodes = ax.nodes || [];
  ws.close();

  // CDP raw: 첫 3개 노드
  console.log('=== CDP getFullAXTree 리턴 형태 (첫 3개 노드) ===\n');
  for (const n of nodes.slice(0, 3)) {
    console.log(JSON.stringify(n, null, 2));
    console.log('---');
  }

  // Playwright ariaSnapshot 리턴 형태 (문서 기반)
  console.log('\n=== Playwright ariaSnapshot() 리턴 형태 (YAML 텍스트) ===\n');
  console.log(`- document "Page Title":
  - heading "Welcome" [level=1]
  - navigation "Main":
    - list:
      - listitem:
        - link "Home"
      - listitem:
        - link "About"
  - main:
    - textbox "Email"
    - button "Submit"
`);

  console.log('=== 비교 요약 ===\n');
  console.log('CDP getFullAXTree:');
  console.log('  - 리턴: { nodes: AXNode[] }  ← JSON 객체 배열');
  console.log(
    '  - 각 노드: { nodeId, ignored, role: {type,value}, name: {type,value}, childIds: [], backendDOMNodeId, properties: [] }'
  );
  console.log('  - ignored 노드 포함 O');
  console.log('  - backendDOMNodeId 포함 → DOM 조작 가능');
  console.log(
    `  - 이 페이지: ${nodes.length}개 노드, ${nodes.filter((n) => n.ignored).length}개 ignored\n`
  );

  console.log('Playwright ariaSnapshot():');
  console.log('  - 리턴: string  ← YAML 형식 텍스트');
  console.log('  - 이미 사람이 읽을 수 있는 트리 형태');
  console.log('  - ignored 노드 포함 X (이미 필터링됨)');
  console.log('  - backendDOMNodeId 없음 → Playwright locator로만 조작');
  console.log('  - Playwright 의존성 필수');
}

main();
