/**
 * Electron Playwright E2E: 예제 앱을 Playwright _electron으로 띄우고 창·클릭·콘솔 검증
 * @see https://playwright.dev/docs/api/class-electron
 * 실행: 워크스페이스 루트에서 build:demo 후 test:e2e:electron
 */

import { existsSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const pkgDir = join(__dirname, '../..');
const workspaceRoot = join(pkgDir, '../..');
const demoDir = join(workspaceRoot, 'examples', 'electron-mcp-demo');
/** cwd(demoDir) 기준 진입점. package.json "main": "dist/main.js" */
const mainScript = 'dist/main.js';

/** 데모 앱의 Electron 실행 파일(Playwright가 아닌 앱과 동일 버전 사용) */
function getDemoElectronPath(): string | undefined {
  const bin = join(demoDir, 'node_modules', '.bin', 'electron');
  if (existsSync(bin)) return bin;
  return undefined;
}

/** CI 또는 RUN_ELECTRON_E2E=1 미설정 시 스킵. 디스플레이 있는 환경에서 RUN_ELECTRON_E2E=1 로 실행. */
const skipElectronE2E = !!process.env.CI || process.env.RUN_ELECTRON_E2E !== '1';

describe.skipIf(skipElectronE2E)('Electron Playwright E2E', () => {
  it('launches demo app and gets first window', async () => {
    const { _electron: electron } = await import('playwright');
    const launchOpts: { cwd: string; args: string[]; timeout: number; executablePath?: string } = {
      cwd: demoDir,
      args: [mainScript],
      timeout: 30000,
    };
    const exe = getDemoElectronPath();
    if (exe) launchOpts.executablePath = exe;
    const electronApp = await electron.launch(launchOpts);
    try {
      const window = await electronApp.firstWindow();
      await expect(window).toBeDefined();
      const title = await window.title();
      expect(title).toBeTruthy();
      await window.screenshot({ path: join(pkgDir, 'dist', 'e2e-intro.png') }).catch(() => {});
    } finally {
      await electronApp.close();
    }
  }, 35000);

  it('clicks button and sees updated text', async () => {
    const { _electron: electron } = await import('playwright');
    const launchOpts: { cwd: string; args: string[]; timeout: number; executablePath?: string } = {
      cwd: demoDir,
      args: [mainScript],
      timeout: 30000,
    };
    const exe = getDemoElectronPath();
    if (exe) launchOpts.executablePath = exe;
    const electronApp = await electron.launch(launchOpts);
    try {
      const window = await electronApp.firstWindow();
      await window.click('button:has-text("Click me")');
      await expect(window.locator('text=count: 1')).toBeVisible({ timeout: 5000 });
      await window.click('button:has-text("Click me")');
      await expect(window.locator('text=count: 2')).toBeVisible({ timeout: 5000 });
    } finally {
      await electronApp.close();
    }
  }, 35000);

  it('captures console messages', async () => {
    const { _electron: electron } = await import('playwright');
    const launchOpts: { cwd: string; args: string[]; timeout: number; executablePath?: string } = {
      cwd: demoDir,
      args: [mainScript],
      timeout: 30000,
    };
    const exe = getDemoElectronPath();
    if (exe) launchOpts.executablePath = exe;
    const electronApp = await electron.launch(launchOpts);
    const logs: string[] = [];
    try {
      const window = await electronApp.firstWindow();
      window.on('console', (msg) => {
        const text = msg.text();
        if (text) logs.push(text);
      });
      await window.click('button:has-text("Click me")');
      await new Promise((r) => setTimeout(r, 500));
      expect(logs.some((t) => t.includes('Button clicked'))).toBe(true);
    } finally {
      await electronApp.close();
    }
  }, 35000);
});
