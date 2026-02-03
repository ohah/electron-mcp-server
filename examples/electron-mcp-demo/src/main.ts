import * as electron from 'electron';
import path from 'node:path';

const app = electron.app;
const BrowserWindow = electron.BrowserWindow;

if (!app || !BrowserWindow) {
  throw new Error('Electron app not available. Run with: electron . (not node)');
}

// 번들러(bunup)가 __dirname을 소스 경로로 대체할 수 있어, 런타임 경로 사용
const distDir = path.join(app.getAppPath(), 'dist');

// MCP 서버(별도 패키지)가 CDP로 연결할 수 있도록 리모트 디버깅 포트 활성화
// E2E 테스트에서 ELECTRON_REMOTE_DEBUGGING_PORT 로 다른 포트 지정 가능
const debugPort = process.env.ELECTRON_REMOTE_DEBUGGING_PORT ?? '9222';
app.commandLine.appendSwitch('remote-debugging-port', debugPort);

function createWindow(url?: string): electron.BrowserWindow {
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
    win.loadURL(url).catch((err) => console.error('loadURL failed:', err));
  } else {
    win
      .loadFile(path.join(distDir, 'renderer', 'index.html'))
      .catch((err) => console.error('loadFile failed:', err));
  }

  return win;
}

const devServerUrl = process.env.VITE_DEV_SERVER_URL;

app.whenReady().then(() => {
  createWindow(devServerUrl);

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow(devServerUrl);
    }
  });
});
