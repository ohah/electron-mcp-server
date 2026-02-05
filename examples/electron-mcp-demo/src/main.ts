import * as electron from 'electron';
import path from 'node:path';
import https from 'node:https';

const app = electron.app;
const BrowserWindow = electron.BrowserWindow;
const ipcMain = electron.ipcMain;

if (!app || !BrowserWindow) {
  throw new Error('Electron app not available. Run with: electron . (not node)');
}

// 번들러(bunup)가 __dirname을 소스 경로로 대체할 수 있어, 런타임 경로 사용
const distDir = path.join(app.getAppPath(), 'dist');

// MCP 서버(별도 패키지)가 CDP로 연결할 수 있도록 리모트 디버깅 포트 활성화
// E2E 테스트에서 ELECTRON_REMOTE_DEBUGGING_PORT 로 다른 포트 지정 가능
const debugPort = process.env.ELECTRON_REMOTE_DEBUGGING_PORT ?? '9222';
app.commandLine.appendSwitch('remote-debugging-port', debugPort);

console.log('[main] electron-mcp-demo starting, remote-debugging-port=%s', debugPort);

function createWindow(url?: string): electron.BrowserWindow {
  console.log('[main] createWindow url=%s', url ?? '(file)');
  const win = new BrowserWindow({
    width: 1024,
    height: 768,
    webPreferences: {
      preload: path.join(distDir, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  if (url) {
    win.loadURL(url).catch((err) => console.error('[main] loadURL failed:', err));
  } else {
    win
      .loadFile(path.join(distDir, 'renderer', 'index.html'))
      .catch((err) => console.error('[main] loadFile failed:', err));
  }

  win.once('ready-to-show', () => {
    console.log('[main] window ready-to-show');
  });
  return win;
}

const devServerUrl = process.env.VITE_DEV_SERVER_URL;

app.whenReady().then(() => {
  console.log('[main] app ready');
  createWindow(devServerUrl);

  // MCP list_electron_main_ipc_events로 래핑 설치 후, 렌더러가 이걸 호출하면 데모용 IPC 핸들러 등록 (래핑된 상태로)
  ipcMain.handle('register-demo-handlers', () => {
    ipcMain.handle('test-ipc', (_event, ...args) => Promise.resolve({ ok: true, args }));
    ipcMain.on('test-ipc-on', (_event, ...args) => {
      console.log('[main] test-ipc-on received', args);
    });
    return 'ok';
  });

  // 메인 프로세스에서 HTTP 요청 → list_electron_main_network_requests로 감지용
  ipcMain.handle('main-fetch-httpbin', () => {
    return new Promise((resolve, reject) => {
      https
        .get('https://httpbin.org/get', (res) => {
          let data = '';
          res.on('data', (chunk) => (data += chunk));
          res.on('end', () => resolve({ status: res.statusCode }));
        })
        .on('error', reject);
    });
  });

  app.on('window-all-closed', () => {
    console.log('[main] window-all-closed');
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });

  app.on('activate', () => {
    console.log('[main] activate');
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow(devServerUrl);
    }
  });
});
