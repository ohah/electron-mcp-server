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

interface TestPanelProps {
  toolId: string;
}

export default function TestPanel({ toolId }: TestPanelProps) {
  const [clickCount, setClickCount] = React.useState(0);
  const [fetchStatus, setFetchStatus] = React.useState<string | null>(null);
  const [fillValue, setFillValue] = React.useState('');
  const [keyLog, setKeyLog] = React.useState<string[]>([]);

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
              MCP 도구 <code>click</code>으로 아래 버튼을 클릭하세요. (selector: data-testid)
            </p>
            <button
              type="button"
              data-testid="demo-click-button"
              onClick={() => setClickCount((c) => c + 1)}
              style={buttonStyle}
            >
              Click me (count: {clickCount})
            </button>
          </section>
        );
      case 'drag':
        return (
          <section style={sectionStyle}>
            <p>
              <code>drag</code> 테스트: MCP로 드래그 앤 드롭을 실행하세요. (스텁일 수 있음)
            </p>
            <div
              data-testid="demo-drag-source"
              style={{
                padding: 16,
                background: '#e8e8e8',
                display: 'inline-block',
                marginRight: 8,
              }}
            >
              드래그 소스
            </div>
            <div
              data-testid="demo-drag-target"
              style={{ padding: 16, background: '#d0d0d0', display: 'inline-block' }}
            >
              드롭 대상
            </div>
          </section>
        );
      case 'fill':
        return (
          <section style={sectionStyle}>
            <p>
              MCP 도구 <code>fill</code>으로 아래 입력란에 값을 채우세요.
            </p>
            <input
              type="text"
              data-testid="demo-fill-input"
              placeholder="fill 테스트"
              value={fillValue}
              onChange={(e) => setFillValue(e.target.value)}
              style={{ ...inputStyle, minWidth: 200 }}
            />
          </section>
        );
      case 'fill_form':
        return (
          <section style={sectionStyle}>
            <p>
              <code>fill_form</code>으로 여러 필드를 한 번에 채우세요. (스텁일 수 있음)
            </p>
            <div>
              <input data-testid="demo-form-name" placeholder="이름" style={inputStyle} />
              <input
                data-testid="demo-form-email"
                placeholder="이메일"
                type="email"
                style={inputStyle}
              />
            </div>
          </section>
        );
      case 'handle_dialog':
        return (
          <section style={sectionStyle}>
            <p>
              alert/confirm/prompt 테스트. 버튼 클릭 후 MCP <code>handle_dialog</code>로 처리하세요.
            </p>
            <button type="button" style={buttonStyle} onClick={() => alert('Alert 테스트')}>
              Alert
            </button>
            <button type="button" style={buttonStyle} onClick={() => confirm('Confirm?')}>
              Confirm
            </button>
          </section>
        );
      case 'hover':
        return (
          <section style={sectionStyle}>
            <p>
              MCP <code>hover</code>로 아래 영역에 마우스를 올리세요.
            </p>
            <div
              data-testid="demo-hover-area"
              style={{ padding: 24, background: '#eee', display: 'inline-block' }}
            >
              Hover 영역
            </div>
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
              placeholder="포커스 후 키 입력"
              style={inputStyle}
              readOnly
              onFocus={() => setKeyLog([])}
            />
            {keyLog.length > 0 && (
              <pre style={{ marginTop: 8, fontSize: 12 }}>{keyLog.join('\n')}</pre>
            )}
          </section>
        );
      case 'upload_file':
        return (
          <section style={sectionStyle}>
            <p>
              <code>upload_file</code> 테스트. (스텁일 수 있음)
            </p>
            <input type="file" data-testid="demo-upload-file" />
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
              먼저 콘솔 로그를 남긴 뒤 <code>get_console_message</code>로 index로 조회하세요.
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
              <p style={{ marginTop: 8 }}>
                <small>{fetchStatus}</small>
              </p>
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
