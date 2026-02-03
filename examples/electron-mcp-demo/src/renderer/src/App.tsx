import React from 'react';

declare const electronAPI: { platform: string; versions: Record<string, string> } | undefined;

export default function App() {
  const [clickCount, setClickCount] = React.useState(0);

  React.useEffect(() => {
    console.log('[Electron MCP Demo] App mounted.');
    return () => console.log('[Electron MCP Demo] App unmounted.');
  }, []);

  const handleClick = () => {
    const next = clickCount + 1;
    setClickCount(next);
    console.log('[Electron MCP Demo] Button clicked, count:', next);
  };

  return (
    <div style={{ padding: 24, fontFamily: 'system-ui' }}>
      <h1>Electron MCP Demo</h1>
      <p>예제 앱 · MCP 서버가 CDP(9222)로 이 창을 제어합니다.</p>
      {electronAPI ? (
        <pre style={{ background: '#f0f0f0', padding: 16, borderRadius: 8 }}>
          platform: {electronAPI.platform}
          {'\n'}
          versions: {JSON.stringify(electronAPI.versions, null, 2)}
        </pre>
      ) : (
        <p>electronAPI not available</p>
      )}
      <section style={{ marginTop: 24 }}>
        <p>
          <strong>click / list_console_messages 테스트:</strong> 버튼을 누르면 카운트가 올라가고
          콘솔에 로그가 남습니다. MCP 툴 <code>click</code>으로 이 버튼을 클릭하거나,{' '}
          <code>list_console_messages</code>로 로그를 확인할 수 있습니다.
        </p>
        <button
          type="button"
          data-testid="demo-click-button"
          onClick={handleClick}
          style={{
            padding: '10px 20px',
            fontSize: 16,
            cursor: 'pointer',
            borderRadius: 8,
            border: '1px solid #333',
            background: '#f0f0f0',
          }}
        >
          Click me (count: {clickCount})
        </button>
      </section>
    </div>
  );
}
