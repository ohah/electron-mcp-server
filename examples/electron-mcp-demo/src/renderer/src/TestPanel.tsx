import React from 'react';

const sectionStyle: React.CSSProperties = {
  marginBottom: 24,
};
const buttonStyle: React.CSSProperties = {
  padding: '10px 20px',
  fontSize: 16,
  cursor: 'pointer',
  borderRadius: 8,
  border: '1px solid #333',
  background: '#f0f0f0',
  marginRight: 8,
  marginTop: 4,
};
const inputStyle: React.CSSProperties = {
  padding: 8,
  fontSize: 14,
  borderRadius: 6,
  border: '1px solid #ccc',
  marginRight: 8,
  marginTop: 4,
};

/** 테스트 성공/상태를 사람이 한눈에 볼 수 있는 피드백 박스 */
const feedbackBoxStyle: React.CSSProperties = {
  marginTop: 16,
  padding: '16px 20px',
  borderRadius: 12,
  border: '2px solid #198754',
  background: '#d1e7dd',
  color: '#0f5132',
  fontSize: 18,
  fontWeight: 700,
  display: 'inline-block',
  minWidth: 280,
};

interface TestPanelProps {
  toolId: string;
}

export default function TestPanel({ toolId }: TestPanelProps) {
  const [clickCount, setClickCount] = React.useState(0);
  const [fetchStatus, setFetchStatus] = React.useState<string | null>(null);
  const [fillValue, setFillValue] = React.useState('');
  const [formName, setFormName] = React.useState('');
  const [formEmail, setFormEmail] = React.useState('');
  const [keyLog, setKeyLog] = React.useState<string[]>([]);
  const [hovered, setHovered] = React.useState(false);
  const [dragDropped, setDragDropped] = React.useState(false);
  const [uploadedFileName, setUploadedFileName] = React.useState<string | null>(null);

  React.useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      setKeyLog((prev) => [...prev.slice(-4), `key: ${e.key}`]);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const handleFetchHttpbin = async () => {
    setFetchStatus('fetching...');
    try {
      const res = await fetch('https://httpbin.org/get');
      const data = await res.json();
      setFetchStatus(`httpbin: ${res.status}`);
      console.log('[Electron MCP Demo] httpbin/get', res.status, data);
    } catch (e) {
      setFetchStatus(`error: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const handleFetchPlaceholder = async () => {
    setFetchStatus('fetching...');
    try {
      const res = await fetch('https://jsonplaceholder.typicode.com/posts/1');
      const data = await res.json();
      setFetchStatus(`placeholder: ${res.status} (post #${data.id})`);
      console.log('[Electron MCP Demo] jsonplaceholder', res.status, data);
    } catch (e) {
      setFetchStatus(`error: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const renderContent = () => {
    switch (toolId) {
      case 'input_automation':
        return (
          <section style={sectionStyle}>
            <p>
              MCP(Cursor 등)에서 아래 도구를 호출해 입력 자동화를 테스트하세요. 먼저 왼쪽에서 해당
              패널을 선택한 뒤, 아래 인자로 도구를 호출하면 해당 영역에 동작이 반영됩니다.
            </p>
            <table
              style={{
                borderCollapse: 'collapse',
                fontSize: 13,
                width: '100%',
                maxWidth: 720,
              }}
            >
              <thead>
                <tr style={{ borderBottom: '2px solid #333', textAlign: 'left' }}>
                  <th style={{ padding: '8px 12px' }}>도구</th>
                  <th style={{ padding: '8px 12px' }}>selector / uid</th>
                  <th style={{ padding: '8px 12px' }}>예시 인자 (MCP 호출용)</th>
                </tr>
              </thead>
              <tbody>
                <tr style={{ borderBottom: '1px solid #ddd', verticalAlign: 'top' }}>
                  <td style={{ padding: '8px 12px' }}>click</td>
                  <td style={{ padding: '8px 12px' }}>
                    <code>[data-testid="demo-click-button"]</code>
                  </td>
                  <td style={{ padding: '8px 12px', fontFamily: 'monospace', fontSize: 12 }}>
                    {`{ "selector": "[data-testid=\\"demo-click-button\\"]" }`}
                  </td>
                </tr>
                <tr style={{ borderBottom: '1px solid #ddd', verticalAlign: 'top' }}>
                  <td style={{ padding: '8px 12px' }}>hover</td>
                  <td style={{ padding: '8px 12px' }}>
                    <code>[data-testid="demo-hover-area"]</code>
                  </td>
                  <td style={{ padding: '8px 12px', fontFamily: 'monospace', fontSize: 12 }}>
                    {`{ "uid": "[data-testid=\\"demo-hover-area\\"]" }`}
                  </td>
                </tr>
                <tr style={{ borderBottom: '1px solid #ddd', verticalAlign: 'top' }}>
                  <td style={{ padding: '8px 12px' }}>fill</td>
                  <td style={{ padding: '8px 12px' }}>
                    <code>[data-testid="demo-fill-input"]</code>
                  </td>
                  <td style={{ padding: '8px 12px', fontFamily: 'monospace', fontSize: 12 }}>
                    {`{ "uid": "...", "value": "hello" }`} (uid는 take_snapshot 후 또는 selector)
                  </td>
                </tr>
                <tr style={{ borderBottom: '1px solid #ddd', verticalAlign: 'top' }}>
                  <td style={{ padding: '8px 12px' }}>fill_form</td>
                  <td style={{ padding: '8px 12px' }}>name, email 필드</td>
                  <td style={{ padding: '8px 12px', fontFamily: 'monospace', fontSize: 12 }}>
                    {`{ "elements": [{ "uid": "...", "value": "이름" }, ...] }`}
                  </td>
                </tr>
                <tr style={{ borderBottom: '1px solid #ddd', verticalAlign: 'top' }}>
                  <td style={{ padding: '8px 12px' }}>
                    handle_dialog <span style={{ color: '#999' }}>(미지원)</span>
                  </td>
                  <td style={{ padding: '8px 12px' }}>Alert/Confirm/Prompt — 수동으로 닫기</td>
                  <td style={{ padding: '8px 12px', fontFamily: 'monospace', fontSize: 12 }}>
                    — Electron 리모트에서 미지원
                  </td>
                </tr>
                <tr style={{ borderBottom: '1px solid #ddd', verticalAlign: 'top' }}>
                  <td style={{ padding: '8px 12px' }}>press_key</td>
                  <td style={{ padding: '8px 12px' }}>입력란 포커스 후</td>
                  <td style={{ padding: '8px 12px', fontFamily: 'monospace', fontSize: 12 }}>
                    {`{ "key": "Enter" }`}, {`{ "key": "Control+A" }`}
                  </td>
                </tr>
                <tr style={{ borderBottom: '1px solid #ddd', verticalAlign: 'top' }}>
                  <td style={{ padding: '8px 12px' }}>upload_file</td>
                  <td style={{ padding: '8px 12px' }}>
                    <code>[data-testid="demo-upload-file"]</code>
                  </td>
                  <td style={{ padding: '8px 12px', fontFamily: 'monospace', fontSize: 12 }}>
                    {`{ "uid": "...", "filePath": "C:\\\\path\\\\file.txt" }`}
                  </td>
                </tr>
                <tr style={{ borderBottom: '1px solid #ddd', verticalAlign: 'top' }}>
                  <td style={{ padding: '8px 12px' }}>take_snapshot</td>
                  <td style={{ padding: '8px 12px' }}>—</td>
                  <td style={{ padding: '8px 12px', fontFamily: 'monospace', fontSize: 12 }}>
                    {`{}`} → 반환된 uid를 click/fill 등에 사용
                  </td>
                </tr>
              </tbody>
            </table>
            <p style={{ marginTop: 16, fontSize: 14, color: '#555' }}>
              <strong>순서:</strong> 1) 왼쪽에서 해당 도구 패널 선택 → 2) MCP로 도구 호출 → 3)
              화면에서 결과 확인.
            </p>
          </section>
        );
      case 'get_electron_window_info':
        return (
          <section style={sectionStyle}>
            <p>
              MCP 도구 <code>get_electron_window_info</code>를 호출해 이 창 정보를 확인하세요.
            </p>
          </section>
        );
      case 'send_command_to_electron':
        return (
          <section style={sectionStyle}>
            <p>
              <code>send_command_to_electron</code>으로 get_title, get_url, get_body_text, eval 등을
              테스트하세요.
            </p>
          </section>
        );
      case 'click':
        return (
          <section style={sectionStyle}>
            <p>
              MCP 도구 <code>click</code>으로 아래 버튼을 클릭하세요. (selector 또는 take_snapshot
              uid)
            </p>
            <button
              type="button"
              data-testid="demo-click-button"
              onClick={() => setClickCount((c) => c + 1)}
              style={buttonStyle}
            >
              Click me (count: {clickCount})
            </button>
            {clickCount > 0 && (
              <div style={feedbackBoxStyle} role="status" aria-live="polite">
                ✓ 클릭됨 — 클릭 횟수: {clickCount} (MCP click 도구 정상 동작)
              </div>
            )}
          </section>
        );
      case 'drag':
        return (
          <section style={sectionStyle}>
            <p>
              MCP 도구 <code>drag</code>로 소스 → 대상으로 드래그하세요. 드롭되면 아래에 결과가
              표시됩니다.
            </p>
            <div
              data-testid="demo-drag-source"
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData('text/plain', 'demo');
              }}
              style={{
                padding: 20,
                background: '#e8e8e8',
                display: 'inline-block',
                marginRight: 12,
                border: '2px solid #666',
                borderRadius: 8,
                cursor: 'grab',
              }}
            >
              드래그 소스
            </div>
            <div
              data-testid="demo-drag-target"
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => setDragDropped(true)}
              style={{
                padding: 20,
                background: dragDropped ? '#d1e7dd' : '#d0d0d0',
                border: `2px solid ${dragDropped ? '#198754' : '#999'}`,
                borderRadius: 8,
                display: 'inline-block',
                minWidth: 120,
              }}
            >
              드롭 대상
            </div>
            {dragDropped && (
              <div style={feedbackBoxStyle} role="status" aria-live="polite">
                ✓ 드롭 완료 — MCP drag 도구 정상 동작
              </div>
            )}
          </section>
        );
      case 'fill':
        return (
          <section style={sectionStyle}>
            <p>
              MCP 도구 <code>fill</code>으로 아래 입력란에 값을 채우세요. (uid 또는 selector{' '}
              <code>[data-testid="demo-fill-input"]</code>)
            </p>
            <input
              type="text"
              data-testid="demo-fill-input"
              placeholder="fill 테스트"
              value={fillValue}
              onChange={(e) => setFillValue(e.target.value)}
              style={{ ...inputStyle, minWidth: 200 }}
            />
            {fillValue && (
              <div style={feedbackBoxStyle} role="status" aria-live="polite">
                ✓ 채워짐 — 현재 값: {fillValue}
              </div>
            )}
          </section>
        );
      case 'fill_form':
        return (
          <section style={sectionStyle}>
            <p>
              MCP 도구 <code>fill_form</code>으로 아래 필드를 한 번에 채우세요. elements에 uid 또는
              selector 사용.
            </p>
            <div>
              <input
                data-testid="demo-form-name"
                placeholder="이름"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                style={inputStyle}
              />
              <input
                data-testid="demo-form-email"
                placeholder="이메일"
                type="email"
                value={formEmail}
                onChange={(e) => setFormEmail(e.target.value)}
                style={inputStyle}
              />
            </div>
            {(formName || formEmail) && (
              <div style={feedbackBoxStyle} role="status" aria-live="polite">
                ✓ 폼 채워짐 — 이름: {formName || '—'}, 이메일: {formEmail || '—'}
              </div>
            )}
          </section>
        );
      case 'handle_dialog':
        return (
          <section style={sectionStyle}>
            <p>
              아래 버튼을 누르면 다이얼로그가 뜹니다. <code>handle_dialog</code>는 Electron
              리모트에서 미지원이므로, 다이얼로그가 뜨면 수동으로 닫아주세요.
            </p>
            <div
              style={{
                ...feedbackBoxStyle,
                borderColor: '#0d6efd',
                background: '#cfe2ff',
                color: '#084298',
                marginBottom: 16,
              }}
              role="status"
            >
              handle_dialog 미지원 — 다이얼로그는 수동으로 닫기
            </div>
            <button
              type="button"
              data-testid="demo-alert-button"
              style={buttonStyle}
              onClick={() => alert('Alert 테스트')}
            >
              Alert
            </button>
            <button
              type="button"
              data-testid="demo-confirm-button"
              style={buttonStyle}
              onClick={() => confirm('Confirm?')}
            >
              Confirm
            </button>
            <button
              type="button"
              data-testid="demo-prompt-button"
              style={buttonStyle}
              onClick={() => prompt('Prompt 테스트', '기본값')}
            >
              Prompt
            </button>
          </section>
        );
      case 'hover':
        return (
          <section style={sectionStyle}>
            <p>
              MCP <code>hover</code>로 아래 영역에 마우스를 올리세요. 영역에 마우스가 오면 색이
              바뀌고 메시지가 나타납니다.
            </p>
            <div
              data-testid="demo-hover-area"
              onMouseEnter={() => setHovered(true)}
              onMouseLeave={() => setHovered(false)}
              style={{
                padding: 28,
                background: hovered ? '#d1e7dd' : '#eee',
                border: `3px solid ${hovered ? '#198754' : '#ccc'}`,
                borderRadius: 12,
                display: 'inline-block',
                minWidth: 200,
                transition: 'background 0.15s, border-color 0.15s',
              }}
            >
              <span
                style={{ color: hovered ? '#0f5132' : 'inherit', fontWeight: hovered ? 700 : 400 }}
              >
                Hover 영역 (마우스를 올리거나 MCP hover 호출)
              </span>
            </div>
            {hovered && (
              <div style={feedbackBoxStyle} role="status" aria-live="polite">
                ✓ 호버 감지됨 — MCP hover 도구 또는 마우스 정상 동작
              </div>
            )}
          </section>
        );
      case 'press_key':
        return (
          <section style={sectionStyle}>
            <p>
              MCP <code>press_key</code> 또는 이 입력란에 포커스 후 키를 누르면 아래에 로그됩니다.
            </p>
            <input
              data-testid="demo-press-key-input"
              placeholder="포커스 후 키 입력 (또는 MCP press_key 호출)"
              style={{ ...inputStyle, minWidth: 280 }}
              readOnly
              onFocus={() => setKeyLog([])}
            />
            {keyLog.length > 0 && (
              <div
                style={{
                  marginTop: 16,
                  padding: 16,
                  background: '#f8f9fa',
                  border: '2px solid #198754',
                  borderRadius: 12,
                  minWidth: 260,
                }}
                role="status"
                aria-live="polite"
              >
                <div style={{ fontSize: 14, fontWeight: 700, color: '#0f5132', marginBottom: 8 }}>
                  ✓ 최근 키 입력 (가시성 테스트)
                </div>
                <pre style={{ margin: 0, fontSize: 16, fontFamily: 'monospace' }}>
                  {keyLog.join('\n')}
                </pre>
              </div>
            )}
          </section>
        );
      case 'upload_file':
        return (
          <section style={sectionStyle}>
            <p>
              MCP <code>upload_file</code>으로 파일을 설정하거나, 아래에서 직접 선택하세요.
            </p>
            <input
              type="file"
              data-testid="demo-upload-file"
              onChange={(e) => {
                const f = e.target.files?.[0];
                setUploadedFileName(f ? f.name : null);
              }}
            />
            {uploadedFileName && (
              <div style={feedbackBoxStyle} role="status" aria-live="polite">
                ✓ 업로드됨: {uploadedFileName}
              </div>
            )}
          </section>
        );
      case 'evaluate_script':
        return (
          <section style={sectionStyle}>
            <p>
              MCP <code>evaluate_script</code>로 document.title, 이 요소의 텍스트 등을 실행해
              보세요.
            </p>
            <p data-testid="demo-eval-target">evaluate_script 대상 텍스트</p>
          </section>
        );
      case 'take_snapshot':
        return (
          <section style={sectionStyle}>
            <p>
              MCP <code>take_snapshot</code>으로 a11y 트리 스냅샷을 확인하세요.
            </p>
          </section>
        );
      case 'list_console_messages':
        return (
          <section style={sectionStyle}>
            <p>
              버튼 클릭 시 콘솔에 로그가 남습니다. MCP <code>list_console_messages</code>로
              수집하세요.
            </p>
            <button
              type="button"
              style={buttonStyle}
              onClick={() => console.log('[Demo] list_console_messages 테스트 로그')}
            >
              콘솔 로그 남기기
            </button>
          </section>
        );
      case 'get_console_message':
        return (
          <section style={sectionStyle}>
            <p>
              먼저 <code>list_console_messages</code>로 목록을 가져온 뒤, 반환된 <code>msgid</code>
              로 <code>get_console_message</code>를 호출하세요.
            </p>
          </section>
        );
      case 'list_pages':
        return (
          <section style={sectionStyle}>
            <p>
              MCP <code>list_pages</code>로 열린 페이지(탭/창) 목록을 조회하세요. 이 창이 목록에
              나옵니다.
            </p>
            <p style={{ fontSize: 14, color: '#555' }}>
              반환된 <code>id</code>는 <code>select_page</code>, <code>close_page</code>에서
              사용합니다.
            </p>
          </section>
        );
      case 'select_page':
        return (
          <section style={sectionStyle}>
            <p>
              먼저 <code>list_pages</code>로 페이지 목록을 가져온 뒤, 그중 <code>id</code>를 사용해{' '}
              <code>select_page</code>로 선택하세요.
            </p>
            <p style={{ fontSize: 14, color: '#555' }}>
              선택한 페이지가 이후 <code>navigate_page</code>, <code>wait_for</code>,{' '}
              <code>evaluate_script</code>, <code>click</code> 등 호출의 컨텍스트가 됩니다.
            </p>
          </section>
        );
      case 'navigate_page':
        return (
          <section style={sectionStyle}>
            <p>
              MCP <code>navigate_page</code>로 URL 이동·새로고침·뒤로/앞으로를 테스트하세요.
            </p>
            <ul style={{ fontSize: 14, color: '#555', marginTop: 8 }}>
              <li>
                <code>type: &quot;url&quot;</code>, <code>url: &quot;https://...&quot;</code> → 해당
                URL로 이동
              </li>
              <li>
                <code>type: &quot;reload&quot;</code> → 현재 페이지 새로고침
              </li>
              <li>
                <code>type: &quot;back&quot;</code> / <code>&quot;forward&quot;</code> → 히스토리
                이동
              </li>
            </ul>
          </section>
        );
      case 'wait_for':
        return (
          <section style={sectionStyle}>
            <p>
              MCP <code>wait_for</code>로 지정한 텍스트가 페이지 본문에 나타날 때까지 대기하세요.
            </p>
            <p style={{ fontSize: 14, color: '#555' }}>
              예: <code>text: &quot;MCP&quot;</code>, <code>text: &quot;Electron&quot;</code> (이
              페이지에 이미 있으므로 즉시 성공합니다.)
            </p>
          </section>
        );
      case 'close_page':
      case 'new_page':
        return (
          <section style={sectionStyle}>
            <p>
              MCP <code>{toolId}</code>: CDP 단독 모드에서는 창 닫기/새 창 열기를 지원하지 않습니다.
              호출 시 안내 메시지가 반환됩니다.
            </p>
          </section>
        );
      case 'emulate':
      case 'resize_page':
        return (
          <section style={sectionStyle}>
            <p>
              MCP <code>{toolId}</code>로 에뮬레이션/리사이즈를 테스트하세요.
            </p>
          </section>
        );
      case 'performance_analyze_insight':
      case 'performance_start_trace':
      case 'performance_stop_trace':
        return (
          <section style={sectionStyle}>
            <p>
              MCP <code>{toolId}</code>로 성능 트레이스를 테스트하세요.
            </p>
          </section>
        );
      case 'list_network_requests':
        return (
          <section style={sectionStyle}>
            <p>
              아래 버튼으로 HTTP 요청을 보낸 뒤 MCP <code>list_network_requests</code>로 목록을
              확인하세요.
            </p>
            <button
              type="button"
              data-testid="demo-fetch-httpbin"
              onClick={handleFetchHttpbin}
              style={buttonStyle}
            >
              Fetch httpbin.org/get
            </button>
            <button
              type="button"
              data-testid="demo-fetch-placeholder"
              onClick={handleFetchPlaceholder}
              style={buttonStyle}
            >
              Fetch jsonplaceholder
            </button>
            {fetchStatus != null && (
              <div
                style={{
                  ...feedbackBoxStyle,
                  ...(fetchStatus.startsWith('error')
                    ? {
                        background: '#f8d7da',
                        border: '2px solid #dc3545',
                        color: '#842029',
                      }
                    : {}),
                }}
                role="status"
              >
                {fetchStatus}
              </div>
            )}
          </section>
        );
      case 'get_network_request':
        return (
          <section style={sectionStyle}>
            <p>
              먼저 <code>list_network_requests</code>로 요청 목록을 가져온 뒤, 반환된 requestId로{' '}
              <code>get_network_request</code>를 호출하세요.
            </p>
          </section>
        );
      case 'list_electron_main_ipc_events':
        return (
          <section style={sectionStyle}>
            <p>
              순서: (1) MCP <code>list_electron_main_ipc_events</code>를 한 번 호출해 메인에 IPC
              래핑 설치 → (2) 아래 &quot;데모 IPC 핸들러 등록&quot; 클릭 → (3) &quot;Invoke
              test-ipc&quot; / &quot;Send test-ipc-on&quot; 클릭 → (4) 다시{' '}
              <code>list_electron_main_ipc_events</code>로 이벤트 목록 확인.
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
              <button
                type="button"
                style={buttonStyle}
                onClick={async () => {
                  try {
                    const r = await window.electronAPI?.registerDemoIpcHandlers();
                    setFetchStatus(r === 'ok' ? '✓ 데모 핸들러 등록됨' : String(r));
                  } catch (e) {
                    setFetchStatus('error: ' + (e instanceof Error ? e.message : String(e)));
                  }
                }}
              >
                데모 IPC 핸들러 등록
              </button>
              <button
                type="button"
                style={buttonStyle}
                onClick={async () => {
                  try {
                    const r = await window.electronAPI?.invokeTestIpc({ ping: true });
                    setFetchStatus(r ? `invoke 응답: ${JSON.stringify(r)}` : 'ok');
                  } catch (e) {
                    setFetchStatus('error: ' + (e instanceof Error ? e.message : String(e)));
                  }
                }}
              >
                Invoke test-ipc
              </button>
              <button
                type="button"
                style={buttonStyle}
                onClick={() => {
                  window.electronAPI?.sendTestIpcOn({ from: 'renderer' });
                  setFetchStatus('Sent test-ipc-on');
                }}
              >
                Send test-ipc-on
              </button>
            </div>
            {fetchStatus != null && (
              <div style={{ ...feedbackBoxStyle, marginTop: 12 }} role="status">
                {fetchStatus}
              </div>
            )}
          </section>
        );
      case 'get_electron_main_ipc_event':
        return (
          <section style={sectionStyle}>
            <p>
              <code>list_electron_main_ipc_events</code>로 목록을 가져온 뒤, 반환된 eventId로{' '}
              <code>get_electron_main_ipc_event</code>를 호출하세요.
            </p>
          </section>
        );
      case 'list_electron_main_network_requests':
        return (
          <section style={sectionStyle}>
            <p>
              (1) MCP <code>list_electron_main_network_requests</code>를 한 번 호출해 메인에
              네트워크 래핑 설치 → (2) 아래 버튼으로 메인 프로세스에서 HTTP 요청 발생 → (3) 다시{' '}
              <code>list_electron_main_network_requests</code>로 목록 확인.
            </p>
            <button
              type="button"
              style={buttonStyle}
              onClick={async () => {
                setFetchStatus('fetching...');
                try {
                  const r = await window.electronAPI?.mainFetchHttpbin();
                  setFetchStatus(r?.status != null ? `main https.get: ${r.status}` : 'done');
                } catch (e) {
                  setFetchStatus('error: ' + (e instanceof Error ? e.message : String(e)));
                }
              }}
            >
              메인에서 httpbin.org/get 요청
            </button>
            {fetchStatus != null && (
              <div
                style={{
                  ...feedbackBoxStyle,
                  marginTop: 12,
                  ...(fetchStatus.startsWith('error')
                    ? { background: '#f8d7da', border: '2px solid #dc3545', color: '#842029' }
                    : {}),
                }}
                role="status"
              >
                {fetchStatus}
              </div>
            )}
          </section>
        );
      case 'get_electron_main_network_request':
        return (
          <section style={sectionStyle}>
            <p>
              <code>list_electron_main_network_requests</code>로 목록을 가져온 뒤, 반환된
              requestId로 <code>get_electron_main_network_request</code>를 호출하세요.
            </p>
          </section>
        );
      default:
        return (
          <section style={sectionStyle}>
            <p>
              도구 <code>{toolId}</code> 테스트 UI.
            </p>
          </section>
        );
    }
  };

  return (
    <div style={{ padding: 24 }}>
      <h2 style={{ marginTop: 0 }}>{toolId}</h2>
      {renderContent()}
    </div>
  );
}
