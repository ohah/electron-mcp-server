import { describe, test, expect, beforeEach } from 'bun:test';
import {
  resetProcessRefs,
  addProcessRef,
  resetIpcRefs,
  addIpcRef,
  formatBytes,
} from '../../src/tools/ref-store';

describe('compact output formats', () => {
  beforeEach(() => {
    resetProcessRefs();
    resetIpcRefs();
  });

  describe('process structure compact format', () => {
    test('process tree output uses [ref=p1] style', () => {
      const mainRef = addProcessRef({ type: 'main', targetId: 'main-1' });
      const rendererRef = addProcessRef({ type: 'renderer', targetId: 'page-1' });

      const line1 = `- main [ref=${mainRef}] "Electron Main"`;
      const line2 = `  - renderer [ref=${rendererRef}] "My App"`;

      expect(line1).toBe('- main [ref=p1] "Electron Main"');
      expect(line2).toBe('  - renderer [ref=p2] "My App"');
      expect(line1).not.toContain('{');
      expect(line1).not.toContain('JSON');
    });
  });

  describe('IPC events compact format', () => {
    test('IPC list output uses [ref=ch1] style', () => {
      const ref1 = addIpcRef({ eventId: 1, channel: 'app:init', direction: 'in' });
      const ref2 = addIpcRef({ eventId: 2, channel: 'db:query', direction: 'invoke' });

      const lines = [
        `# 2 IPC events`,
        `- on [ref=${ref1}] "app:init" args=0`,
        `- invoke [ref=${ref2}] "db:query" args=3`,
      ];

      expect(lines[0]).toBe('# 2 IPC events');
      expect(lines[1]).toBe('- on [ref=ch1] "app:init" args=0');
      expect(lines[2]).toBe('- invoke [ref=ch2] "db:query" args=3');
    });
  });

  describe('resource usage compact format', () => {
    test('resource output is readable text not JSON', () => {
      const output = [
        '# Main Process (pid=12345)',
        '',
        '## Memory',
        `  rss:          ${formatBytes(50 * 1024 * 1024)}`,
        `  heap used:    ${formatBytes(30 * 1024 * 1024)} / ${formatBytes(40 * 1024 * 1024)}`,
        `  external:     ${formatBytes(5 * 1024 * 1024)}`,
      ].join('\n');

      expect(output).toContain('# Main Process (pid=12345)');
      expect(output).toContain('50.0MB');
      expect(output).toContain('30.0MB');
      expect(output).not.toContain('"rss"');
      expect(output).not.toContain('{');
    });
  });

  describe('console message compact format', () => {
    test('console list is one-line-per-message format', () => {
      const line = 'msgid=1 [renderer] [error] Uncaught TypeError: x is not a function';
      expect(line).toContain('msgid=1');
      expect(line).toContain('[renderer]');
      expect(line).toContain('[error]');
    });

    test('console detail is compact text not JSON', () => {
      const detail = [
        '[renderer] [error] Uncaught TypeError: x is not a function',
        '  source: javascript',
        '  url: app.js:42:5',
      ].join('\n');

      expect(detail).not.toContain('{');
      expect(detail).toContain('source:');
      expect(detail).toContain('url:');
    });
  });

  describe('network request compact format', () => {
    test('network list is one-line-per-request format', () => {
      const line = '- [renderer] GET https://api.example.com/data 200 id=req1';
      expect(line).toContain('[renderer]');
      expect(line).toContain('GET');
      expect(line).toContain('200');
      expect(line).toContain('id=req1');
      expect(line).not.toContain('{');
    });
  });
});
