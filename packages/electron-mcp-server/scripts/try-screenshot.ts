#!/usr/bin/env bun
/**
 * 스크린샷 테스트: 9222 포트로 떠 있는 Electron 앱 화면을 캡처합니다.
 * 사용: bun run scripts/try-screenshot.ts [출력경로]
 *
 * 사전 조건: Electron 앱을 --remote-debugging-port=9222 로 실행해 두기
 * 예: examples/electron-mcp-demo 에서 electron . --remote-debugging-port=9222
 */
import { takeScreenshot } from '../src/tools/screenshot';

const outputPath = process.argv[2] ?? 'electron-screenshot.png';

async function main() {
  console.error('Electron 앱 스크린샷 시도 중... (포트 9222)');
  const result = await takeScreenshot(outputPath);
  console.error('완료.');
  if (result.filePath) console.log('저장:', result.filePath);
  console.log('base64 길이:', result.base64.length);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
