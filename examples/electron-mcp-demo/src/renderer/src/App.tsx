import React from 'react';
import { TOOLS, IMPLEMENTED_IDS, DISABLED_IDS } from './toolList';
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
                <span
                  style={{
                    fontSize: 13,
                    wordBreak: 'break-word',
                    ...(DISABLED_IDS.has(tool.id)
                      ? { textDecoration: 'line-through', color: '#999' }
                      : {}),
                  }}
                >
                  {tool.label}
                </span>
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
          <div style={{ padding: 24 }}>
            <h2 style={{ marginTop: 0 }}>Snapshot 토큰 비교 테스트</h2>
            <p style={{ color: '#666', marginBottom: 24 }}>
              아래 인터랙티브 요소들로 take_snapshot 토큰 차이를 비교합니다.
            </p>

            <section style={{ marginBottom: 24 }}>
              <h3>폼 입력</h3>
              <form style={{ display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 400 }}>
                <input type="text" placeholder="이름" aria-label="이름" style={{ padding: 8, borderRadius: 6, border: '1px solid #ccc' }} />
                <input type="email" placeholder="이메일" aria-label="이메일" style={{ padding: 8, borderRadius: 6, border: '1px solid #ccc' }} />
                <input type="tel" placeholder="전화번호" aria-label="전화번호" style={{ padding: 8, borderRadius: 6, border: '1px solid #ccc' }} />
                <input type="password" placeholder="비밀번호" aria-label="비밀번호" style={{ padding: 8, borderRadius: 6, border: '1px solid #ccc' }} />
                <textarea placeholder="메모" aria-label="메모" rows={3} style={{ padding: 8, borderRadius: 6, border: '1px solid #ccc' }} />
                <select aria-label="카테고리" style={{ padding: 8, borderRadius: 6, border: '1px solid #ccc' }}>
                  <option value="">카테고리 선택</option>
                  <option value="bug">버그 리포트</option>
                  <option value="feature">기능 요청</option>
                  <option value="question">질문</option>
                </select>
                <div style={{ display: 'flex', gap: 16 }}>
                  <label><input type="checkbox" /> 동의합니다</label>
                  <label><input type="checkbox" /> 알림 수신</label>
                </div>
                <div style={{ display: 'flex', gap: 16 }}>
                  <label><input type="radio" name="priority" value="low" /> 낮음</label>
                  <label><input type="radio" name="priority" value="mid" /> 보통</label>
                  <label><input type="radio" name="priority" value="high" /> 높음</label>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button type="submit" style={{ padding: '8px 20px', borderRadius: 6, border: '1px solid #333', background: '#4CAF50', color: 'white', cursor: 'pointer' }}>제출</button>
                  <button type="reset" style={{ padding: '8px 20px', borderRadius: 6, border: '1px solid #333', background: '#f0f0f0', cursor: 'pointer' }}>초기화</button>
                  <button type="button" style={{ padding: '8px 20px', borderRadius: 6, border: '1px solid #333', background: '#2196F3', color: 'white', cursor: 'pointer' }}>미리보기</button>
                </div>
              </form>
            </section>

            <section style={{ marginBottom: 24 }}>
              <h3>네비게이션</h3>
              <nav style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <a href="#home" style={{ padding: '8px 16px', borderRadius: 6, background: '#e3f2fd', textDecoration: 'none', color: '#1565C0' }}>홈</a>
                <a href="#about" style={{ padding: '8px 16px', borderRadius: 6, background: '#e3f2fd', textDecoration: 'none', color: '#1565C0' }}>소개</a>
                <a href="#docs" style={{ padding: '8px 16px', borderRadius: 6, background: '#e3f2fd', textDecoration: 'none', color: '#1565C0' }}>문서</a>
                <a href="#api" style={{ padding: '8px 16px', borderRadius: 6, background: '#e3f2fd', textDecoration: 'none', color: '#1565C0' }}>API</a>
                <a href="#changelog" style={{ padding: '8px 16px', borderRadius: 6, background: '#e3f2fd', textDecoration: 'none', color: '#1565C0' }}>변경로그</a>
                <a href="#support" style={{ padding: '8px 16px', borderRadius: 6, background: '#e3f2fd', textDecoration: 'none', color: '#1565C0' }}>지원</a>
              </nav>
            </section>

            <section style={{ marginBottom: 24 }}>
              <h3>탭 & 토글</h3>
              <div role="tablist" style={{ display: 'flex', gap: 4 }}>
                <button role="tab" aria-selected={true} style={{ padding: '8px 16px', borderRadius: '6px 6px 0 0', border: '1px solid #ccc', borderBottom: 'none', background: 'white', cursor: 'pointer' }}>일반</button>
                <button role="tab" aria-selected={false} style={{ padding: '8px 16px', borderRadius: '6px 6px 0 0', border: '1px solid #ccc', borderBottom: 'none', background: '#f0f0f0', cursor: 'pointer' }}>고급</button>
                <button role="tab" aria-selected={false} style={{ padding: '8px 16px', borderRadius: '6px 6px 0 0', border: '1px solid #ccc', borderBottom: 'none', background: '#f0f0f0', cursor: 'pointer' }}>설정</button>
                <button role="tab" aria-selected={false} style={{ padding: '8px 16px', borderRadius: '6px 6px 0 0', border: '1px solid #ccc', borderBottom: 'none', background: '#f0f0f0', cursor: 'pointer' }}>로그</button>
              </div>
              <div role="tabpanel" style={{ border: '1px solid #ccc', padding: 16, borderRadius: '0 6px 6px 6px' }}>
                <p>일반 탭 컨텐츠입니다.</p>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input type="range" min="0" max="100" defaultValue="50" aria-label="볼륨" />
                  볼륨
                </label>
              </div>
            </section>

            <section style={{ marginBottom: 24 }}>
              <h3>테이블</h3>
              <table style={{ borderCollapse: 'collapse', width: '100%', maxWidth: 500 }}>
                <thead>
                  <tr>
                    <th style={{ border: '1px solid #ddd', padding: 8, background: '#f5f5f5' }}>이름</th>
                    <th style={{ border: '1px solid #ddd', padding: 8, background: '#f5f5f5' }}>상태</th>
                    <th style={{ border: '1px solid #ddd', padding: 8, background: '#f5f5f5' }}>액션</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td style={{ border: '1px solid #ddd', padding: 8 }}>Main Process</td>
                    <td style={{ border: '1px solid #ddd', padding: 8 }}>실행중</td>
                    <td style={{ border: '1px solid #ddd', padding: 8 }}><button style={{ cursor: 'pointer' }}>재시작</button></td>
                  </tr>
                  <tr>
                    <td style={{ border: '1px solid #ddd', padding: 8 }}>Renderer</td>
                    <td style={{ border: '1px solid #ddd', padding: 8 }}>활성</td>
                    <td style={{ border: '1px solid #ddd', padding: 8 }}><button style={{ cursor: 'pointer' }}>새로고침</button></td>
                  </tr>
                  <tr>
                    <td style={{ border: '1px solid #ddd', padding: 8 }}>Worker</td>
                    <td style={{ border: '1px solid #ddd', padding: 8 }}>대기중</td>
                    <td style={{ border: '1px solid #ddd', padding: 8 }}><button style={{ cursor: 'pointer' }}>시작</button></td>
                  </tr>
                </tbody>
              </table>
            </section>

            <section style={{ marginBottom: 24 }}>
              <h3>검색 & 파일</h3>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <input type="search" placeholder="검색어 입력" aria-label="검색" style={{ padding: 8, borderRadius: 6, border: '1px solid #ccc', flex: 1, minWidth: 200 }} />
                <button style={{ padding: '8px 16px', borderRadius: 6, border: '1px solid #333', background: '#FF9800', color: 'white', cursor: 'pointer' }}>검색</button>
              </div>
              <div style={{ marginTop: 8 }}>
                <input type="file" aria-label="파일 업로드" />
              </div>
            </section>
          </div>
        )}
      </main>
    </div>
  );
}
