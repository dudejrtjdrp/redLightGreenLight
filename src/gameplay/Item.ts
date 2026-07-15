/**
 * Item.ts
 * 짐(cargo) 데이터 모델 + Object Pool.
 * 짐 = 점수. 짐은 두 상태를 가진다:
 *   - OWNED   : 특정 무버가 등에 보유
 *   - DROPPED : 낙하하여 트랙 위에 남음(뒤 무버가 회수 가능, v1 소멸 안 함)
 * 생성/파괴 대신 ItemPool에서 재사용(퍼포먼스 원칙).
 */

import { ObjectPool } from "../core/ObjectPool";
import { Vec2, copyVec2 } from "./types";

export enum ItemState {
  OWNED = "OWNED",
  DROPPED = "DROPPED",
}

export interface Item {
  /** 풀 슬롯 식별자. 대여 시 1회 부여 후 재사용 내내 유지. */
  id: number;
  state: ItemState;
  /** OWNED일 때 소유 무버 id, DROPPED면 null */
  ownerId: number | null;
  /** DROPPED일 때 트랙 위 위치, OWNED면 null(무버 위치를 따름) */
  position: Vec2 | null;
  /** 풀에서 대여 중(활성) 여부 */
  active: boolean;
}

/**
 * ItemPool
 * ObjectPool<Item>을 감싸 짐의 생명주기(대여/반납)와 id 부여를 관리.
 */
export class ItemPool {
  private readonly pool: ObjectPool<Item>;
  private nextId = 0;

  constructor(prewarm = 0) {
    this.pool = new ObjectPool<Item>(
      () => this.make(),
      (item) => this.resetItem(item),
      prewarm,
    );
  }

  private make(): Item {
    return {
      id: -1,
      state: ItemState.OWNED,
      ownerId: null,
      position: null,
      active: false,
    };
  }

  private resetItem(item: Item): void {
    item.state = ItemState.OWNED;
    item.ownerId = null;
    item.position = null;
    item.active = false;
  }

  /** 무버 소유 상태로 짐 대여. */
  acquireOwned(ownerId: number): Item {
    const item = this.pool.acquire();
    if (item.id < 0) item.id = this.nextId++;
    item.state = ItemState.OWNED;
    item.ownerId = ownerId;
    item.position = null;
    item.active = true;
    return item;
  }

  /** 짐을 트랙에 낙하 상태로 전환(위치 기록). 실제 점수 처리는 이후 Phase. */
  setDropped(item: Item, position: Vec2): void {
    item.state = ItemState.DROPPED;
    item.ownerId = null;
    item.position = copyVec2(position);
  }

  /** 뒤 무버가 회수 → 다시 소유 상태로. */
  setOwned(item: Item, ownerId: number): void {
    item.state = ItemState.OWNED;
    item.ownerId = ownerId;
    item.position = null;
  }

  /** 짐을 풀로 반납(재사용 대기). */
  release(item: Item): void {
    this.pool.release(item);
  }

  get activeCount(): number {
    return this.pool.activeCount;
  }
  get freeCount(): number {
    return this.pool.freeCount;
  }
}
