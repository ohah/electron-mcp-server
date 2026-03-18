/**
 * deepResolveArgs의 Runtime.getProperties 재귀 탐색에서
 * depth/properties 제한에 따른 CDP 호출 횟수를 검증.
 *
 * 실제 CDP 대신 mock으로 호출 횟수를 카운트.
 */
import { describe, test, expect } from 'bun:test';

// --- console.ts 내부 로직을 동일하게 재현 (mock CDP 버전) ---

interface RemoteObjectLike {
  type: string;
  subtype?: string;
  className?: string;
  value?: unknown;
  description?: string;
  objectId?: string;
  preview?: unknown;
}

interface PropertyDescriptor {
  name: string;
  value?: RemoteObjectLike;
}

/** 깊이 N, 속성 수 P로 트리형 객체 구조를 시뮬레이션하는 mock CDP 응답 생성기 */
function createMockObjectTree(totalDepth: number, propsPerLevel: number) {
  let nextObjId = 1;
  // objectId → 해당 객체가 반환할 PropertyDescriptor[]
  const registry = new Map<string, PropertyDescriptor[]>();

  function buildLevel(depth: number): string {
    const objId = `obj-${nextObjId++}`;
    const props: PropertyDescriptor[] = [];

    for (let i = 0; i < propsPerLevel; i++) {
      if (depth < totalDepth) {
        // 자식 객체
        const childId = buildLevel(depth + 1);
        props.push({
          name: `prop${i}`,
          value: { type: 'object', objectId: childId },
        });
      } else {
        // 리프: 프리미티브
        props.push({
          name: `prop${i}`,
          value: { type: 'string', value: `leaf-${i}` },
        });
      }
    }
    registry.set(objId, props);
    return objId;
  }

  const rootId = buildLevel(0);
  return { rootId, registry };
}

/** 순환 참조 객체 시뮬레이션 */
function createCircularMock() {
  const registry = new Map<string, PropertyDescriptor[]>();

  // a → b → c → a (순환)
  registry.set('a', [
    { name: 'child', value: { type: 'object', objectId: 'b' } },
    { name: 'name', value: { type: 'string', value: 'nodeA' } },
  ]);
  registry.set('b', [
    { name: 'child', value: { type: 'object', objectId: 'c' } },
    { name: 'name', value: { type: 'string', value: 'nodeB' } },
  ]);
  registry.set('c', [
    { name: 'child', value: { type: 'object', objectId: 'a' } }, // 순환!
    { name: 'name', value: { type: 'string', value: 'nodeC' } },
  ]);

  return { rootId: 'a', registry };
}

// --- formatWithGetProperties / formatResolvedValue 재현 ---

async function formatWithGetProperties(
  registry: Map<string, PropertyDescriptor[]>,
  objectId: string,
  subtype: string | undefined,
  depth: number,
  seen: Set<string>,
  maxDepth: number,
  maxProps: number,
  counter: { cdpCalls: number }
): Promise<string> {
  if (depth > maxDepth) return '{...}';
  if (seen.has(objectId)) return '[Circular]';
  seen.add(objectId);

  counter.cdpCalls++; // Runtime.getProperties 1회
  const descriptors = registry.get(objectId) ?? [];
  if (descriptors.length === 0) return '{}';

  const isArray = subtype === 'array';
  const entries: string[] = [];
  let truncated = false;

  for (const prop of descriptors) {
    if (isArray && prop.name === 'length') continue;
    if (!prop.value) continue;
    if (entries.length >= maxProps) {
      truncated = true;
      break;
    }

    const val = await formatResolvedValue(
      registry,
      prop.value,
      depth + 1,
      seen,
      maxDepth,
      maxProps,
      counter
    );
    entries.push(isArray ? val : `${prop.name}: ${val}`);
  }

  const suffix = truncated ? ', ...' : '';
  return isArray ? `[${entries.join(', ')}${suffix}]` : `{${entries.join(', ')}${suffix}}`;
}

async function formatResolvedValue(
  registry: Map<string, PropertyDescriptor[]>,
  value: RemoteObjectLike,
  depth: number,
  seen: Set<string>,
  maxDepth: number,
  maxProps: number,
  counter: { cdpCalls: number }
): Promise<string> {
  if (value.type === 'string') return JSON.stringify(value.value ?? '');
  if (value.type === 'number' || value.type === 'boolean') return String(value.value);
  if (value.type === 'undefined') return 'undefined';
  if (value.subtype === 'null') return 'null';

  if (value.objectId && depth <= maxDepth) {
    return formatWithGetProperties(
      registry,
      value.objectId,
      value.subtype,
      depth,
      seen,
      maxDepth,
      maxProps,
      counter
    );
  }

  return value.description ?? '[object Object]';
}

// --- 테스트 ---

describe('deepResolveArgs CDP call count', () => {
  test('depth=3, 5 props/level → CDP 호출 횟수 확인', async () => {
    const { rootId, registry } = createMockObjectTree(5, 5);
    const counter = { cdpCalls: 0 };

    const result = await formatWithGetProperties(
      registry,
      rootId,
      undefined,
      0,
      new Set(),
      3,
      50,
      counter
    );

    // depth 0→1→2→3, 각 레벨 5개 자식
    // total = 1 + 5 + 25 + 125 = 156
    console.error(`depth=3, 5 props: ${counter.cdpCalls} CDP calls`);
    expect(counter.cdpCalls).toBe(156);
    // depth 초과 시 objectId가 없는 fallback → [object Object]로 표시
    expect(result).toContain('[object Object]');
  });

  test('depth=무제한, 5 props/level, 5 depth 트리 → CDP 호출 폭발', async () => {
    const { rootId, registry } = createMockObjectTree(5, 5);
    const counter = { cdpCalls: 0 };

    const result = await formatWithGetProperties(
      registry,
      rootId,
      undefined,
      0,
      new Set(),
      999,
      50,
      counter
    );

    // depth 무제한: 리프 노드까지 모두 getProperties 시도
    // total = 1 + 5 + 25 + 125 + 625 + 3125 = 3906
    console.error(`depth=unlimited, 5 props, 5 levels: ${counter.cdpCalls} CDP calls`);
    expect(counter.cdpCalls).toBe(3906);
  });

  test('depth=무제한, 10 props/level, 5 depth 트리 → 더 큰 폭발', async () => {
    const { rootId, registry } = createMockObjectTree(5, 10);
    const counter = { cdpCalls: 0 };

    const result = await formatWithGetProperties(
      registry,
      rootId,
      undefined,
      0,
      new Set(),
      999,
      50,
      counter
    );

    // 10 props, 5 depth: 1 + 10 + 100 + 1000 + 10000 + 100000 = 111111
    console.error(`depth=unlimited, 10 props, 5 levels: ${counter.cdpCalls} CDP calls`);
    expect(counter.cdpCalls).toBe(111111);
  });

  test('depth=3, 10 props/level, 5 depth 트리 → 제한된 호출', async () => {
    const { rootId, registry } = createMockObjectTree(5, 10);
    const counter = { cdpCalls: 0 };

    const result = await formatWithGetProperties(
      registry,
      rootId,
      undefined,
      0,
      new Set(),
      3,
      50,
      counter
    );

    // depth 3 제한: 1 + 10 + 100 + 1000 = 1111
    console.error(`depth=3, 10 props, 5 levels: ${counter.cdpCalls} CDP calls`);
    expect(counter.cdpCalls).toBe(1111);
  });

  test('depth=3, MAX_PROPERTIES=5로 제한하면 더 적은 호출', async () => {
    const { rootId, registry } = createMockObjectTree(5, 10);
    const counter = { cdpCalls: 0 };

    const result = await formatWithGetProperties(
      registry,
      rootId,
      undefined,
      0,
      new Set(),
      3,
      5,
      counter
    );

    // maxProps=5로 잘림: 1 + 5 + 25 + 125 = 156
    console.error(`depth=3, maxProps=5, 10 props: ${counter.cdpCalls} CDP calls`);
    expect(counter.cdpCalls).toBe(156);
    expect(result).toContain('...');
  });

  test('순환 참조 → seen으로 무한 루프 방지', async () => {
    const { rootId, registry } = createCircularMock();
    const counter = { cdpCalls: 0 };

    const result = await formatWithGetProperties(
      registry,
      rootId,
      undefined,
      0,
      new Set(),
      999,
      50,
      counter
    );

    // a → b → c → a(Circular) : 3 CDP calls
    console.error(`circular: ${counter.cdpCalls} CDP calls, result: ${result}`);
    expect(counter.cdpCalls).toBe(3);
    expect(result).toContain('[Circular]');
  });

  test('비교 요약: depth 제한 유무에 따른 CDP 호출 차이', async () => {
    const scenarios = [
      { depth: 5, props: 3, label: '3 props, 5 levels' },
      { depth: 5, props: 5, label: '5 props, 5 levels' },
      { depth: 5, props: 10, label: '10 props, 5 levels' },
      { depth: 10, props: 3, label: '3 props, 10 levels' },
    ];

    console.error('\n=== CDP 호출 횟수 비교 (depth=3 vs 무제한) ===');
    console.error('시나리오                    | depth=3  | 무제한   | 배율');
    console.error('---------------------------|----------|---------|------');

    for (const { depth, props, label } of scenarios) {
      const { rootId: r1, registry: reg1 } = createMockObjectTree(depth, props);
      const { rootId: r2, registry: reg2 } = createMockObjectTree(depth, props);
      const c1 = { cdpCalls: 0 };
      const c2 = { cdpCalls: 0 };

      await formatWithGetProperties(reg1, r1, undefined, 0, new Set(), 3, 50, c1);
      await formatWithGetProperties(reg2, r2, undefined, 0, new Set(), 999, 50, c2);

      const ratio = (c2.cdpCalls / c1.cdpCalls).toFixed(1);
      console.error(
        `${label.padEnd(27)}| ${String(c1.cdpCalls).padEnd(8)} | ${String(c2.cdpCalls).padEnd(7)} | ${ratio}x`
      );
    }
  });
});
