/**
 * NavigationBucketStore — 콘솔, 네트워크 등에서 공통 사용하는
 * 내비게이션 기반 버킷 저장소 패턴을 추출한 재사용 유틸리티.
 *
 * 동작: 최신 내비게이션이 [0]에 위치, 내비게이션 발생 시 앞에 새 버킷 추가,
 * maxBuckets 초과 시 가장 오래된 버킷 제거.
 */

import { MAX_NAVIGATION_SAVED } from './constants';

export interface NavigationBucketStoreOptions<T> {
  /** 보관할 내비게이션 버킷 수 (기본: MAX_NAVIGATION_SAVED) */
  maxBuckets?: number;
  /** 버킷에서 제거될 때 호출되는 콜백 */
  onEvict?: (entries: T[]) => void;
}

export class NavigationBucketStore<T> {
  private buckets: T[][] = [[]];
  private readonly maxBuckets: number;
  private readonly onEvict?: (entries: T[]) => void;

  constructor(options: NavigationBucketStoreOptions<T> = {}) {
    this.maxBuckets = options.maxBuckets ?? MAX_NAVIGATION_SAVED;
    this.onEvict = options.onEvict;
  }

  /** 현재 버킷이 비어있지 않은지 확인하고 없으면 생성 */
  private ensureCurrentBucket(): void {
    if (this.buckets.length === 0) {
      this.buckets.push([]);
    }
  }

  /** 현재(최신) 버킷에 항목 추가 */
  add(entry: T): void {
    this.ensureCurrentBucket();
    this.buckets[0].push(entry);
  }

  /** 내비게이션 발생 시 새 버킷 생성. 초과분 제거. */
  splitAfterNavigation(): void {
    this.buckets.unshift([]);
    if (this.buckets.length > this.maxBuckets) {
      const removed = this.buckets.pop();
      if (removed && this.onEvict) {
        this.onEvict(removed);
      }
    }
  }

  /** 현재 내비게이션 항목만 반환 */
  getCurrentEntries(): T[] {
    return this.buckets[0] ?? [];
  }

  /** 보관된 모든 내비게이션 항목 반환 (최신 순) */
  getAllEntries(includePreserved: boolean): T[] {
    if (!includePreserved) {
      return this.getCurrentEntries();
    }
    const out: T[] = [];
    for (let i = 0; i < this.maxBuckets && i < this.buckets.length; i++) {
      const bucket = this.buckets[i];
      if (bucket) out.push(...bucket);
    }
    return out;
  }

  /** 전체 초기화 */
  clear(): void {
    this.buckets.length = 0;
    this.buckets.push([]);
  }

  /** 총 항목 수 */
  get size(): number {
    let count = 0;
    for (const bucket of this.buckets) {
      count += bucket.length;
    }
    return count;
  }
}
