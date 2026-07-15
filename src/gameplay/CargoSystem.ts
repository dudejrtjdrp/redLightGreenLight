/**
 * CargoSystem.ts
 * 짐(cargo) 소유/낙하/회수/점수 귀속의 단일 소유자. Phase 4의 심장.
 *
 * 핵심 규칙(자해 구조):
 *   낙하 1개 = 소유 무버 짐 -1 (내 잠재 점수 손실) + 술래 +1 (상한 내).
 *   → "떨어뜨려도 안 죽지만 내 점수 손해 + 술래 이득"이 코드상 실제로 성립.
 *     dropOne()의 console.assert / 로그로 매 낙하 검증.
 *
 * 낙하물은 소멸하지 않고 트랙 위 좌표에 DROPPED 상태로 잔류(Pool 반환 X).
 * 회수는 반경 기반 자동 흡수 + "자기보다 뒤 무버만" 게이트.
 *
 * === 알려진 미해결 이슈 (Phase 7 기준, TODO) ===
 * TODO(balance): 재수확 상한(maxSeekerHarvestPerItem=3)이 실플레이에서 적정한지 미검증.
 *   너무 낮으면 술래 파밍이 죽고, 너무 높으면 무한 faucet에 가까워짐. 멀티 플레이테스트 필요.
 * TODO(recovery): 회수 반경/속도가 하드 게이트(즉시 흡수)라 "스캐빈저 남용" 우려 —
 *   뒤 무버가 앞 무버 낙하물을 공짜로 쓸어담아 리필처럼 악용 가능. 회수에 비용/딜레이/횟수 제한 검토.
 * TODO(recovery): v1 싱글에선 뒤 무버가 없어 회수 경로가 사실상 미검증. 더미/멀티에서 실측 필요.
 * TODO(edge): 낙하물이 완주선 근처에 쌓일 때 회수-재낙하 루프 가능성(스캐빈저 남용)의 상한 정책 미정.
 */

import { gameBus } from "../core/EventBus";
import { ItemConfig } from "../config/ItemConfig";
import { Item, ItemPool } from "./Item";
import { Mover, MoverStatus } from "./Mover";
import { Seeker } from "./Seeker";
// EventMap 선언 병합 로드 보장(item:dropped 타입).
import "./GameplayEvents";

export class CargoSystem {
  private readonly pool: ItemPool;
  /** 무버별 보유 짐 실체(개수는 mover.cargo와 동기). */
  private readonly ownedByMover = new Map<number, Item[]>();
  /** 트랙 위에 낙하해 남아있는 짐들. */
  private readonly dropped: Item[] = [];

  constructor(
    private readonly seeker: Seeker,
    prewarm = 0,
  ) {
    this.pool = new ItemPool(prewarm);
  }

  get droppedCount(): number {
    return this.dropped.length;
  }

  /** 무버 시작 짐을 풀에서 대여해 소유로 부여(생성/파괴 없이 재사용). */
  spawnInitial(mover: Mover): void {
    const items: Item[] = [];
    for (let i = 0; i < mover.cargo; i++) {
      items.push(this.pool.acquireOwned(mover.id));
    }
    this.ownedByMover.set(mover.id, items);
  }

  /**
   * 급정지 낙하: count개를 소유 목록에서 꺼내 트랙에 떨어뜨린다.
   * @returns 실제 낙하한 개수(보유량으로 상한).
   */
  dropFrom(mover: Mover, count: number): number {
    const owned = this.ownedByMover.get(mover.id);
    if (!owned || owned.length === 0 || count <= 0) return 0;
    const n = Math.min(count, owned.length);
    for (let i = 0; i < n; i++) {
      const item = owned.pop() as Item;
      this.dropOne(mover, item);
    }
    return n;
  }

  /** 낙하 1개 처리 + 자해 구조 검증 로그 + item:dropped emit. */
  private dropOne(mover: Mover, item: Item): void {
    const cargoBefore = mover.cargo;
    const seekerBefore = this.seeker.score;

    // 트랙에 낙하 상태로 잔류(소멸/반환 X).
    this.pool.setDropped(item, mover.position);
    item.dropperId = mover.id;
    mover.cargo -= 1;
    this.dropped.push(item);

    // 술래 가점: 재수확 상한 내에서만(무한 faucet 방지).
    let seekerGained = 0;
    if (item.harvestCount < ItemConfig.maxSeekerHarvestPerItem) {
      item.harvestCount += 1;
      this.seeker.score += ItemConfig.pointPerItem;
      this.seeker.droppedCargoClaimed += 1;
      seekerGained = ItemConfig.pointPerItem;
    }

    // === 자해 구조 검증 ===
    // 내 짐은 반드시 정확히 1 감소(잠재 점수 손실). 술래는 상한 내 +1(이득).
    // 상한 내에서 스윙 = -1(나) + +1(술래) = 2점. 상한 초과 시 스윙 = 1점(나만 손해).
    console.assert(
      mover.cargo === cargoBefore - 1,
      "[BUG] 낙하 시 소유 무버 짐이 정확히 1 감소해야 함",
    );
    const swing = 1 + seekerGained; // 나 손실 1 + 술래 이득
    console.log(
      `[DROP] item#${item.id} by mover ${mover.id} | ` +
        `cargo ${cargoBefore}→${mover.cargo} | ` +
        `seeker ${seekerBefore}→${this.seeker.score} | ` +
        `swing ${swing}점 | harvest ${item.harvestCount}/${ItemConfig.maxSeekerHarvestPerItem}`,
    );

    gameBus.emit("item:dropped", {
      itemId: item.id,
      byMoverId: mover.id,
      position: { x: mover.position.x, z: mover.position.z },
    });
  }

  /**
   * 회수 스캔(반경 기반 자동 흡수).
   * 규칙: "자기보다 뒤에 있는 무버만 회수 가능."
   *   - 전진 방향은 -z. 무버 z ≥ 짐 z 이면 무버가 짐보다 "뒤"(시작 쪽).
   *   - 자기 낙하물(dropperId===자신)은 회수 불가 → 급정지 후 즉시 재흡수 방지.
   *   - 반경 내(dz ≤ recoverRadius)면 흡수.
   * v1 싱글: 뒤 무버가 없어 거의 발동 안 함(설계상 정상). 멀티/더미에서 동작.
   */
  updateRecovery(movers: readonly Mover[]): void {
    if (this.dropped.length === 0) return;
    for (const mover of movers) {
      if (mover.status !== MoverStatus.ALIVE) continue;
      for (let i = this.dropped.length - 1; i >= 0; i--) {
        const item = this.dropped[i];
        if (item.position === null) continue;
        if (item.dropperId === mover.id) continue; // 자기 낙하물 불가
        if (mover.position.z < item.position.z) continue; // 이미 앞섬 → 불가
        const dz = mover.position.z - item.position.z; // ≥ 0
        if (dz > ItemConfig.recoverRadius) continue;

        // 회수: 낙하 목록에서 제거 → 소유로 전환(harvestCount 유지 = double-dip 추적).
        this.dropped.splice(i, 1);
        this.pool.setOwned(item, mover.id);
        const owned = this.ownedByMover.get(mover.id) ?? [];
        owned.push(item);
        this.ownedByMover.set(mover.id, owned);
        mover.cargo += 1;
        console.log(
          `[RECOVER] mover ${mover.id} ← item#${item.id} ` +
            `(harvest ${item.harvestCount}/${ItemConfig.maxSeekerHarvestPerItem}) cargo→${mover.cargo}`,
        );
      }
    }
  }

  /** 트랙 위 낙하물 스냅샷(렌더/디버그용, 읽기 전용). */
  get droppedItems(): readonly Item[] {
    return this.dropped;
  }
}
