/**
 * ObjectPool.ts
 * 제네릭 오브젝트 풀 스텁. 객체 생성 최소화(퍼포먼스 최우선 원칙).
 * 짐/이펙트/파티클 등 반복 생성-소멸되는 객체에 사용한다.
 *
 * 사용:
 *   const pool = new ObjectPool(() => makeThing(), (t) => resetThing(t), 16);
 *   const t = pool.acquire();
 *   ...
 *   pool.release(t);
 */

export class ObjectPool<T> {
  private readonly free: T[] = [];
  private readonly inUse = new Set<T>();

  /**
   * @param factory  새 객체 생성 함수 (풀이 비었을 때만 호출)
   * @param reset    반납 시 상태 초기화 함수 (선택)
   * @param prewarm  미리 생성해 둘 개수 (선택)
   */
  constructor(
    private readonly factory: () => T,
    private readonly reset?: (obj: T) => void,
    prewarm = 0,
  ) {
    for (let i = 0; i < prewarm; i++) {
      this.free.push(this.factory());
    }
  }

  /** 객체 하나 대여. 풀이 비었으면 새로 생성. */
  acquire(): T {
    const obj = this.free.pop() ?? this.factory();
    this.inUse.add(obj);
    return obj;
  }

  /** 사용 끝난 객체 반납. reset이 있으면 초기화 후 재사용 대기. */
  release(obj: T): void {
    if (!this.inUse.delete(obj)) return; // 이 풀 소유가 아니면 무시
    this.reset?.(obj);
    this.free.push(obj);
  }

  /** 대여 중인 모든 객체 반납 */
  releaseAll(): void {
    for (const obj of Array.from(this.inUse)) {
      this.release(obj);
    }
  }

  get activeCount(): number {
    return this.inUse.size;
  }

  get freeCount(): number {
    return this.free.length;
  }
}
