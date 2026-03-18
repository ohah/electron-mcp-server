import { describe, test, expect, beforeEach } from 'bun:test';
import { NavigationBucketStore } from '../../src/tools/navigation-bucket-store';

describe('NavigationBucketStore', () => {
  let store: NavigationBucketStore<{ id: number; value: string }>;

  beforeEach(() => {
    store = new NavigationBucketStore({ maxBuckets: 3 });
  });

  test('add and getCurrentEntries', () => {
    store.add({ id: 1, value: 'a' });
    store.add({ id: 2, value: 'b' });
    const entries = store.getCurrentEntries();
    expect(entries).toHaveLength(2);
    expect(entries[0].id).toBe(1);
    expect(entries[1].id).toBe(2);
  });

  test('splitAfterNavigation creates new bucket', () => {
    store.add({ id: 1, value: 'before' });
    store.splitAfterNavigation();
    store.add({ id: 2, value: 'after' });

    const current = store.getCurrentEntries();
    expect(current).toHaveLength(1);
    expect(current[0].id).toBe(2);
  });

  test('getAllEntries with includePreserved=false returns current only', () => {
    store.add({ id: 1, value: 'old' });
    store.splitAfterNavigation();
    store.add({ id: 2, value: 'new' });

    const current = store.getAllEntries(false);
    expect(current).toHaveLength(1);
    expect(current[0].id).toBe(2);
  });

  test('getAllEntries with includePreserved=true returns all', () => {
    store.add({ id: 1, value: 'first' });
    store.splitAfterNavigation();
    store.add({ id: 2, value: 'second' });

    const all = store.getAllEntries(true);
    expect(all).toHaveLength(2);
  });

  test('evicts oldest bucket when exceeding maxBuckets', () => {
    const evicted: Array<{ id: number; value: string }[]> = [];
    store = new NavigationBucketStore({
      maxBuckets: 2,
      onEvict: (entries) => evicted.push(entries),
    });

    store.add({ id: 1, value: 'nav1' });
    store.splitAfterNavigation();
    store.add({ id: 2, value: 'nav2' });
    store.splitAfterNavigation(); // evicts nav1
    store.add({ id: 3, value: 'nav3' });

    expect(evicted).toHaveLength(1);
    expect(evicted[0][0].id).toBe(1);

    const all = store.getAllEntries(true);
    expect(all).toHaveLength(2);
    expect(all.map((e) => e.id).sort()).toEqual([2, 3]);
  });

  test('clear resets everything', () => {
    store.add({ id: 1, value: 'a' });
    store.add({ id: 2, value: 'b' });
    store.splitAfterNavigation();
    store.add({ id: 3, value: 'c' });

    store.clear();
    expect(store.getCurrentEntries()).toHaveLength(0);
    expect(store.getAllEntries(true)).toHaveLength(0);
    expect(store.size).toBe(0);
  });

  test('size returns total count across buckets', () => {
    store.add({ id: 1, value: 'a' });
    store.add({ id: 2, value: 'b' });
    store.splitAfterNavigation();
    store.add({ id: 3, value: 'c' });

    expect(store.size).toBe(3);
  });

  test('empty store returns empty arrays', () => {
    expect(store.getCurrentEntries()).toHaveLength(0);
    expect(store.getAllEntries(false)).toHaveLength(0);
    expect(store.getAllEntries(true)).toHaveLength(0);
    expect(store.size).toBe(0);
  });
});
