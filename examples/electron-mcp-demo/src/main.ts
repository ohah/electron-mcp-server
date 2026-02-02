import * as electron from 'electron';
import path from 'node:path';

const app = electron.app;
const BrowserWindow = electron.BrowserWindow;

if (!app || !BrowserWindow) {
  throw new Error('Electron app not available. Run with: electron . (not node)');
}

declare const __dirname: string;

// MCP 서버(별도 패키지)가 CDP로 연결할 수 있도록 리모트 디버깅 포트 활성화
app.commandLine.appendSwitch('remote-debugging-port', '9222');

function createWindow(url?: string): electron.BrowserWindow {
  const win = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  if (url) {
    win.loadURL(url).catch((err) => console.error('loadURL failed:', err));
  } else {
    win
      .loadFile(path.join(__dirname, 'renderer', 'index.html'))
      .catch((err) => console.error('loadFile failed:', err));
  }

  return win;
}

app.whenReady().then(() => {
  createWindow();

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});
