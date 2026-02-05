import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  versions: process.versions,
  /** MCP list_electron_main_ipc_events 호출로 래핑 설치 후, 메인에 데모 핸들러 등록 */
  registerDemoIpcHandlers: () => ipcRenderer.invoke('register-demo-handlers'),
  /** 등록된 test-ipc 핸들러 호출 (invoke) → IPC 모니터에 기록됨 */
  invokeTestIpc: (payload?: unknown) => ipcRenderer.invoke('test-ipc', payload),
  /** test-ipc-on 채널로 전송 (on) → IPC 모니터에 기록됨 */
  sendTestIpcOn: (payload?: unknown) => ipcRenderer.send('test-ipc-on', payload),
  /** 메인 프로세스에서 https.get 호출 → 메인 네트워크 모니터에 기록됨 */
  mainFetchHttpbin: () => ipcRenderer.invoke('main-fetch-httpbin'),
});
