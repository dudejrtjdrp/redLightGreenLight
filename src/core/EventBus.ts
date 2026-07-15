/**
 * EventBus.ts
 * 최소 이벤트 버스 스텁. 데이터 중심 + 이벤트 기반 구조의 척추.
 * 상태관리 라이브러리 없이 시스템 간 결합을 낮추는 용도.
 *
 * 사용:
 *   bus.on("game:start", (p) => { ... });
 *   bus.emit("game:start", { seed: 1 });
 *   bus.off("game:start", handler);
 *
 * 이벤트 타입은 확장 시 EventMap에 추가한다.
 */

/** 알려진 이벤트와 payload 타입 맵. 기능 추가 시 여기에 등록. */
export interface EventMap {
  /** 게임 루프가 처음 시작될 때 */
  "loop:start": void;
  /** 매 고정 스텝 업데이트 (dt 초 단위) — 필요 시스템만 구독 */
  "loop:update": { dt: number };
  /** 창 리사이즈 */
  "view:resize": { width: number; height: number };
}

export type EventKey = keyof EventMap;
type Handler<K extends EventKey> = (payload: EventMap[K]) => void;

export class EventBus {
  private readonly listeners = new Map<EventKey, Set<Handler<EventKey>>>();

  on<K extends EventKey>(key: K, handler: Handler<K>): void {
    let set = this.listeners.get(key);
    if (!set) {
      set = new Set();
      this.listeners.set(key, set);
    }
    set.add(handler as Handler<EventKey>);
  }

  off<K extends EventKey>(key: K, handler: Handler<K>): void {
    this.listeners.get(key)?.delete(handler as Handler<EventKey>);
  }

  emit<K extends EventKey>(key: K, payload: EventMap[K]): void {
    const set = this.listeners.get(key);
    if (!set) return;
    // 복사 없이 순회하되, 핸들러 내부에서 off를 호출해도 안전하도록 스냅샷.
    for (const handler of Array.from(set)) {
      (handler as Handler<K>)(payload);
    }
  }

  /** 특정 키 또는 전체 구독 해제 (씬 파괴 시 정리용) */
  clear(key?: EventKey): void {
    if (key) this.listeners.delete(key);
    else this.listeners.clear();
  }
}

/** 전역 단일 버스 (v1 싱글플레이 편의). 필요 시 DI로 교체 가능. */
export const gameBus = new EventBus();
