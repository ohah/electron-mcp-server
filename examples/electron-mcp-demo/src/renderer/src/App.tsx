import React from 'react';
import { TOOLS, IMPLEMENTED_IDS } from './toolList';
import TestPanel from './TestPanel';

const SIDEBAR_WIDTH = 280;

export default function App() {
  const [selectedId, setSelectedId] = React.useState<string | null>(null);

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', fontFamily: 'system-ui' }}>
      {/* 왼쪽: 테스트 항목 사이드바 (이슈 #3 기준 구현된 항목만 ✓) */}
      <aside
        style={{
          width: SIDEBAR_WIDTH,
          flexShrink: 0,
          borderRight: '1px solid #ddd',
          background: '#f8f9fa',
          overflowY: 'auto',
          padding: 12,
        }}
      >
        <h3 style={{ margin: '0 0 12px', fontSize: 14, color: '#555' }}>MCP 도구 테스트</h3>
        <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {TOOLS.map((tool) => {
            const implemented = IMPLEMENTED_IDS.has(tool.id);
            const selected = selectedId === tool.id;
            return (
              <li
                key={tool.id}
                role="button"
                tabIndex={0}
                data-testid={`sidebar-${tool.id}`}
                onClick={() => setSelectedId(tool.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setSelectedId(tool.id);
                  }
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '8px 10px',
                  cursor: 'pointer',
                  borderRadius: 6,
                  background: selected ? '#e3f2fd' : 'transparent',
                  marginBottom: 2,
                }}
              >
                <span
                  style={{
                    width: 20,
                    height: 20,
                    flexShrink: 0,
                    border: '1px solid #999',
                    borderRadius: 4,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: implemented ? '#28a745' : '#fff',
                    color: implemented ? '#fff' : 'transparent',
                    fontSize: 12,
                    fontWeight: 'bold',
                  }}
                  aria-hidden
                >
                  {implemented ? '✓' : ''}
                </span>
                <span style={{ fontSize: 13, wordBreak: 'break-word' }}>{tool.label}</span>
              </li>
            );
          })}
        </ul>
      </aside>

      {/* 오른쪽: 메인 테스트 UI */}
      <main
        style={{
          flex: 1,
          overflowY: 'auto',
          background: '#fff',
        }}
      >
        {selectedId ? (
          <TestPanel toolId={selectedId} />
        ) : (
          <div style={{ padding: 48, color: '#666', textAlign: 'center' }}>
            <p>왼쪽 사이드바에서 테스트할 MCP 도구를 선택하세요.</p>
            <p style={{ fontSize: 14 }}>
              <strong>✓</strong> = 이슈 #3 기준 구현 완료, 빈 칸 = 미구현.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
