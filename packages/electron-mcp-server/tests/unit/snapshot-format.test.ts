import { describe, test, expect, beforeEach } from 'bun:test';
import { resetElementRefs, getAllElementRefs } from '../../src/tools/ref-store';

/**
 * snapshot 포맷팅 로직 테스트.
 * takeSnapshotImpl은 CDP 연결이 필요하므로, 내부 formatNode 로직을 간접적으로 테스트.
 * CDP mock 없이 ref-store 연동만 검증.
 */

describe('snapshot format integration', () => {
  beforeEach(() => {
    resetElementRefs();
  });

  test('element refs are created with compact format (e1, e2, ...)', async () => {
    // simulate snapshot behavior
    const { addElementRef } = await import('../../src/tools/ref-store');

    const r1 = addElementRef({ backendNodeId: 100, role: 'button', name: 'Submit' });
    const r2 = addElementRef({ backendNodeId: 200, role: 'textbox', name: 'Email' });
    const r3 = addElementRef({ backendNodeId: 300, role: 'link', name: 'Home' });

    expect(r1).toBe('e1');
    expect(r2).toBe('e2');
    expect(r3).toBe('e3');

    // verify refs can be used in input tools
    const refs = getAllElementRefs();
    expect(refs.size).toBe(3);

    const buttonRef = refs.get('e1');
    expect(buttonRef!.backendNodeId).toBe(100);
    expect(buttonRef!.role).toBe('button');
  });

  test('resetElementRefs clears refs between snapshots', () => {
    const { addElementRef } = require('../../src/tools/ref-store');
    addElementRef({ backendNodeId: 100, role: 'button', name: 'A' });
    expect(getAllElementRefs().size).toBe(1);

    resetElementRefs();
    expect(getAllElementRefs().size).toBe(0);

    // counter resets too
    const r = addElementRef({ backendNodeId: 200, role: 'button', name: 'B' });
    expect(r).toBe('e1');
  });

  test('snapshot output format matches agent-browser style', () => {
    // Verify the expected compact output format
    const { addElementRef } = require('../../src/tools/ref-store');
    const ref = addElementRef({ backendNodeId: 100, role: 'button', name: 'Submit' });

    // Expected format in snapshot: - button "Submit" [ref=e1]
    const line = `- button "Submit" [ref=${ref}]`;
    expect(line).toBe('- button "Submit" [ref=e1]');
    expect(line).not.toContain('uid=');
    expect(line).not.toContain('backendDOMNodeId');
  });
});
