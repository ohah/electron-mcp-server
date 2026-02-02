declare const electronAPI: { platform: string; versions: Record<string, string> } | undefined;

export default function App() {
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
    </div>
  );
}
