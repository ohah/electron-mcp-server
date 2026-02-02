/**
 * Take screenshot of a running Electron app via Playwright CDP.
 */

import { chromium } from 'playwright';
import { scanForElectronApps } from './discovery';

export async function takeScreenshot(
  outputPath?: string,
  windowTitle?: string
): Promise<{ filePath?: string; base64: string }> {
  const apps = await scanForElectronApps();
  if (apps.length === 0) {
    throw new Error(
      'No Electron app with remote debugging. Start with: electron . --remote-debugging-port=9222'
    );
  }
  let app = apps[0];
  if (windowTitle) {
    const byTitle = apps.find((a) =>
      a.targets.some((t) => (t.title || '').toLowerCase().includes(windowTitle.toLowerCase()))
    );
    if (byTitle) app = byTitle;
  }
  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${app.port}`);
  try {
    const contexts = browser.contexts();
    if (contexts.length === 0) throw new Error('No browser context');
    const allPages = contexts[0].pages();
    if (allPages.length === 0) throw new Error('No page');
    let targetPage = allPages[0];
    for (const p of allPages) {
      const url = p.url();
      const title = await p.title().catch(() => '');
      if (
        !url.includes('devtools://') &&
        !url.includes('about:blank') &&
        !title.includes('DevTools')
      ) {
        if (windowTitle && title.toLowerCase().includes(windowTitle.toLowerCase())) {
          targetPage = p;
          break;
        }
        if (!windowTitle) {
          targetPage = p;
          break;
        }
      }
    }
    const buffer = await targetPage.screenshot({ type: 'png', fullPage: false });
    const base64 = Buffer.from(buffer).toString('base64');
    if (outputPath) {
      const fs = await import('fs/promises');
      await fs.writeFile(outputPath, buffer);
      return { filePath: outputPath, base64 };
    }
    return { base64 };
  } finally {
    await browser.close();
  }
}
