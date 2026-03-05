import { describe, test, expect, beforeEach } from 'bun:test';
import {
  resetElementRefs,
  addElementRef,
  getElementRef,
  getAllElementRefs,
  resetProcessRefs,
  addProcessRef,
  getProcessRef,
  resetIpcRefs,
  addIpcRef,
  getIpcRef,
  parseRef,
  resolveRef,
  formatBytes,
  formatMicroseconds,
} from '../../src/tools/ref-store';

describe('ref-store', () => {
  beforeEach(() => {
    resetElementRefs();
    resetProcessRefs();
    resetIpcRefs();
  });

  describe('element refs', () => {
    test('addElementRef returns sequential refs e1, e2, e3', () => {
      const r1 = addElementRef({ backendNodeId: 100, role: 'button', name: 'Submit' });
      const r2 = addElementRef({ backendNodeId: 200, role: 'textbox', name: 'Email' });
      const r3 = addElementRef({ backendNodeId: 300, role: 'link', name: 'Home' });
      expect(r1).toBe('e1');
      expect(r2).toBe('e2');
      expect(r3).toBe('e3');
    });

    test('getElementRef retrieves correct data', () => {
      addElementRef({ backendNodeId: 100, role: 'button', name: 'Submit' });
      const data = getElementRef('e1');
      expect(data).toBeDefined();
      expect(data!.backendNodeId).toBe(100);
      expect(data!.role).toBe('button');
      expect(data!.name).toBe('Submit');
    });

    test('getElementRef returns undefined for missing ref', () => {
      expect(getElementRef('e999')).toBeUndefined();
    });

    test('resetElementRefs clears all refs and resets counter', () => {
      addElementRef({ backendNodeId: 100, role: 'button', name: 'A' });
      addElementRef({ backendNodeId: 200, role: 'button', name: 'B' });
      resetElementRefs();
      expect(getAllElementRefs().size).toBe(0);
      const r1 = addElementRef({ backendNodeId: 300, role: 'button', name: 'C' });
      expect(r1).toBe('e1');
    });
  });

  describe('process refs', () => {
    test('addProcessRef returns p1, p2', () => {
      const r1 = addProcessRef({ type: 'main', targetId: 't1' });
      const r2 = addProcessRef({ type: 'renderer', targetId: 't2' });
      expect(r1).toBe('p1');
      expect(r2).toBe('p2');
    });

    test('getProcessRef retrieves correct data', () => {
      addProcessRef({ type: 'main', targetId: 't1', pid: 1234 });
      const data = getProcessRef('p1');
      expect(data).toBeDefined();
      expect(data!.type).toBe('main');
      expect(data!.pid).toBe(1234);
    });
  });

  describe('ipc refs', () => {
    test('addIpcRef returns ch1, ch2', () => {
      const r1 = addIpcRef({ eventId: 1, channel: 'app:init', direction: 'in' });
      const r2 = addIpcRef({ eventId: 2, channel: 'db:query', direction: 'invoke' });
      expect(r1).toBe('ch1');
      expect(r2).toBe('ch2');
    });

    test('getIpcRef retrieves correct data', () => {
      addIpcRef({ eventId: 42, channel: 'test:channel', direction: 'invoke' });
      const data = getIpcRef('ch1');
      expect(data).toBeDefined();
      expect(data!.eventId).toBe(42);
      expect(data!.channel).toBe('test:channel');
      expect(data!.direction).toBe('invoke');
    });
  });

  describe('parseRef', () => {
    test('parses @e1 format', () => {
      expect(parseRef('@e1')).toBe('e1');
    });

    test('parses ref=e1 format', () => {
      expect(parseRef('ref=e1')).toBe('e1');
    });

    test('parses bare e1 format', () => {
      expect(parseRef('e1')).toBe('e1');
    });

    test('parses process refs', () => {
      expect(parseRef('@p1')).toBe('p1');
      expect(parseRef('p2')).toBe('p2');
    });

    test('parses ipc refs', () => {
      expect(parseRef('@ch1')).toBe('ch1');
      expect(parseRef('ch3')).toBe('ch3');
    });

    test('returns null for CSS selectors', () => {
      expect(parseRef('button.submit')).toBeNull();
      expect(parseRef('#my-id')).toBeNull();
      expect(parseRef('.class-name')).toBeNull();
    });

    test('returns null for empty string', () => {
      expect(parseRef('')).toBeNull();
    });

    test('trims whitespace', () => {
      expect(parseRef('  @e1  ')).toBe('e1');
    });
  });

  describe('resolveRef', () => {
    test('resolves element ref', () => {
      addElementRef({ backendNodeId: 100, role: 'button', name: 'OK' });
      const result = resolveRef('e1');
      expect(result).toBeDefined();
      expect(result!.type).toBe('element');
    });

    test('resolves process ref', () => {
      addProcessRef({ type: 'main', targetId: 't1' });
      const result = resolveRef('p1');
      expect(result).toBeDefined();
      expect(result!.type).toBe('process');
    });

    test('resolves ipc ref', () => {
      addIpcRef({ eventId: 1, channel: 'test' });
      const result = resolveRef('ch1');
      expect(result).toBeDefined();
      expect(result!.type).toBe('ipc');
    });

    test('returns null for unknown ref', () => {
      expect(resolveRef('x99')).toBeNull();
    });
  });

  describe('formatBytes', () => {
    test('formats bytes', () => {
      expect(formatBytes(500)).toBe('500B');
    });

    test('formats kilobytes', () => {
      expect(formatBytes(2048)).toBe('2KB');
    });

    test('formats megabytes', () => {
      expect(formatBytes(5 * 1024 * 1024)).toBe('5.0MB');
    });

    test('formats gigabytes', () => {
      expect(formatBytes(2.5 * 1024 * 1024 * 1024)).toBe('2.5GB');
    });
  });

  describe('formatMicroseconds', () => {
    test('formats microseconds', () => {
      expect(formatMicroseconds(500)).toBe('500µs');
    });

    test('formats milliseconds', () => {
      expect(formatMicroseconds(5000)).toBe('5.0ms');
    });

    test('formats seconds', () => {
      expect(formatMicroseconds(2500000)).toBe('2.50s');
    });
  });
});
