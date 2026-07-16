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
import { BalanceConfig } from "../config/BalanceConfig";
import { EffectConfig } from "../config/EffectConfig";
import { Item, ItemPool } from "./Item";
import { Mover, MoverStatus } from "./Mover";
import { Seeker } from "./Seeker";
// EventMap 선언 병합 로드 보장(item:dropped 타입).
import "./GameplayEvents";

/** 착지 대기 중인 낙하 짐(비행 애니 동안 회수/표시 X). */
interface PendingDrop {
  item: Item;
  timer: number;
}

export class CargoSystem {
  private readonly pool: ItemPool;
  /** 무버별 보유 짐 실체(개수는 mover.cargo와 동기). */
  private readonly ownedByMover = new Map<number, Item[]>();
  /** 트랙 위에 착지해 남아있는(회수 가능) 낙하 짐들. */
  private readonly dropped: Item[] = [];
  /** 분리됐지만 아직 비행 중(착지 전)인 낙하 짐들. */
  private readonly pending: PendingDrop[] = [];

  constructor(
    private readonly seeker: Seeker,
    prewarm = 0,
  ) {
    this.pool = new ItemPool(prewarm);
    // 시각 낙하가 바닥에 닿는 순간 → 회수 가능한 트랙 낙하물로 전환(끊김 없이 동기).
    gameBus.on("item:landed", ({ itemId }) => this.landById(itemId));
  }

  /** 착지 이벤트로 pending → dropped 전환. */
  private landById(itemId: number): void {
    for (let i = 0; i < this.pending.length; i++) {
      if (this.pending[i].item.id === itemId) {
        this.dropped.push(this.pending[i].item);
        this.pending.splice(i, 1);
        return;
      }
    }
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
   * 낙하: count개를 소유 목록에서 꺼내 트랙에 떨어뜨린다.
   * @param awardSeeker false면 술래 가점 없이 낙하만(라운드 종료 후 줄서기 연출용 forfeit).
   * @returns 실제 낙하한 개수(보유량으로 상한).
   */
  dropFrom(mover: Mover, count: number, awardSeeker = true): number {
    const owned = this.ownedByMover.get(mover.id);
    if (!owned || owned.length === 0 || count <= 0) return 0;
    const n = Math.min(count, owned.length);
    for (let i = 0; i < n; i++) {
      const item = owned.pop() as Item;
      this.dropOne(mover, item, awardSeeker);
    }
    return n;
  }

  /**
   * 낙하 1개 처리(분리 시점): 카운트/점수/emit은 지금, 회수 가능화는 착지 후.
   *  - 짐은 tilt 방향 바깥으로 밀려나 착지(landing = 회수 위치).
   *  - 비행 동안은 pending(표시/회수 X). 착지(updateFlights) 후 dropped로 전환.
   */
  private dropOne(mover: Mover, item: Item, awardSeeker = true): void {
    const cargoBefore = mover.cargo;
    const seekerBefore = this.seeker.score;

    // 낙하 방향 = 쏠린 방향(sign(tilt)). 몸 lean·스택 shear와 동일 부호축(월드 +x = tilt>0=오른쪽).
    // (MoverView shear에 -부호를 줘 로컬↔월드 뒤집힘을 이미 통일했으므로 여기선 +sign(tilt) 그대로.)
    const launchDir =
      mover.tilt > 0.001 ? 1 : mover.tilt < -0.001 ? -1 : Math.random() < 0.5 ? -1 : 1;
    const spread = BalanceConfig.dropLandingSpread;
    const landing = {
      x: mover.position.x + launchDir * spread,
      z: mover.position.z - 0.3, // 스택이 얹힌 앞쪽(월드 -z) 근처
    };
    // [검증] 쏠린 방향과 낙하 방향 일치 확인.
    console.log(
      `[DROP-DIR] tilt ${mover.tilt.toFixed(2)} → 낙하 ${launchDir > 0 ? "오른쪽(+x)" : "왼쪽(-x)"}`,
    );

    // 착지 좌표를 낙하 위치로 설정(회수는 여기서). 단 pending 동안은 미노출/미회수.
    this.pool.setDropped(item, landing);
    item.dropperId = mover.id;
    mover.cargo -= 1;

    // 술래 가점: 재수확 상한 내에서만(무한 faucet 방지). forfeit 낙하는 가점 없음.
    let seekerGained = 0;
    if (awardSeeker && item.harvestCount < ItemConfig.maxSeekerHarvestPerItem) {
      item.harvestCount += 1;
      this.seeker.score += ItemConfig.pointPerItem;
      this.seeker.droppedCargoClaimed += 1;
      seekerGained = ItemConfig.pointPerItem;
    }

    // === 자해 구조 검증 ===
    console.assert(
      mover.cargo === cargoBefore - 1,
      "[BUG] 낙하 시 소유 무버 짐이 정확히 1 감소해야 함",
    );
    const swing = 1 + seekerGained;
    console.log(
      `[DROP] item#${item.id} by mover ${mover.id} | ` +
        `cargo ${cargoBefore}→${mover.cargo} | ` +
        `seeker ${seekerBefore}→${this.seeker.score} | ` +
        `swing ${swing}점 | harvest ${item.harvestCount}/${ItemConfig.maxSeekerHarvestPerItem}`,
    );

    // 비행 대기열에 등록(착지 후 회수 가능). onItemDropped는 분리 시점에 emit.
    // 아크 시작점(from)은 렌더 레이어(GameRenderer)가 실제 top-box 월드좌표로 채움 →
    // 여기선 착지점(to)만 전달. (허공/밑동 스폰 금지, 팝인 없음)
    // 착지는 item:landed(시각 낙하가 바닥에 닿을 때)로 전환. timer는 이벤트 누락 대비 안전장치.
    this.pending.push({ item, timer: EffectConfig.dropFlight.safety + 1.0 });
    gameBus.emit("item:dropped", {
      itemId: item.id,
      byMoverId: mover.id,
      // 착지 높이 = 짐 박스 절반(밑면이 도로 상판 y=0에 닿는 지점).
      to: {
        x: landing.x,
        y: (ItemConfig.stackGap * 0.9 * ItemConfig.visualScale) / 2 + 0.01,
        z: landing.z,
      },
    });
  }

  /** 안전장치: 착지 이벤트 누락 시 타임아웃으로 강제 전환. 정상은 item:landed로 처리. */
  updateFlights(dt: number): void {
    if (this.pending.length === 0) return;
    for (let i = this.pending.length - 1; i >= 0; i--) {
      const p = this.pending[i];
      p.timer -= dt;
      if (p.timer <= 0) {
        this.pending.splice(i, 1);
        this.dropped.push(p.item);
      }
    }
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
        const dx = mover.position.x - item.position.x; // 멀티(넓은 길) 대응: x 거리도 판정
        if (dz * dz + dx * dx > ItemConfig.recoverRadius * ItemConfig.recoverRadius)
          continue;

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
