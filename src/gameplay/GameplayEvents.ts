/**
 * GameplayEvents.ts
 * Phase 2 게임플레이 이벤트 정의 + "emit 지점" 헬퍼.
 *
 * 설계:
 *  - core/EventBus의 EventMap을 "선언 병합"으로 확장한다.
 *    → Phase 1 파일(EventBus.ts)을 수정하지 않고 gameplay 레이어에서 이벤트를 추가.
 *    → core가 gameplay를 역참조하지 않음(레이어 방향 유지).
 *  - 처리 로직은 다음 Phase. 여기서는 상태 전이 + emit "지점"만 제공한다.
 *
 * 프롬프트 이벤트 매핑:
 *   onPhaseChange   → "phase:change"
 *   onItemDropped   → "item:dropped"
 *   onMoverCaught   → "mover:caught"
 *   onMoverFinished → "mover:finished"
 */

import { gameBus } from "../core/EventBus";
import { Item, ItemState } from "./Item";
import { Mover, MoverStatus } from "./Mover";
import { Vec2, copyVec2 } from "./types";
import { RoundPhase } from "./RoundState";

// --- EventMap 선언 병합 (core/EventBus.ts는 건드리지 않음) ---
declare module "../core/EventBus" {
  interface EventMap {
    /** 라운드 페이즈 전환 */
    "phase:change": { from: RoundPhase; to: RoundPhase };
    /** 짐 낙하: 낙하한 짐 1개당 1회 emit (술래 +1점 근거) */
    "item:dropped": { itemId: number; byMoverId: number; position: Vec2 };
    /** 무버 체포: 레드 때 전진 이동 또는 경고 누적 초과로 탈락 */
    "mover:caught": { moverId: number };
    /** 무버 완주: 도착 지점 진입 */
    "mover:finished": { moverId: number; cargoDelivered: number };
    /** RED 중 균형(A/D) 보정 1회 경고 누적(시각 플래시/술래 응시용) */
    "mover:warned": { moverId: number; warnings: number };
  }
}

/**
 * emit 지점 헬퍼들.
 * 다음 Phase(입력/충돌/판정)에서 실제 조건이 만족될 때 호출한다.
 * 지금은 "상태 전이 + emit"만 하고, 점수 정산 등 파생 처리는 구독자 몫(추후).
 */

/** 짐을 트랙에 낙하시키고 이벤트 발행. (급정지 낙하 모델의 결과 반영 지점) */
export function emitItemDropped(item: Item, byMoverId: number, position: Vec2): void {
  item.state = ItemState.DROPPED;
  item.ownerId = null;
  item.position = copyVec2(position);
  gameBus.emit("item:dropped", {
    itemId: item.id,
    byMoverId,
    position: copyVec2(position),
  });
}

/** 무버를 체포(탈락) 처리하고 이벤트 발행. (레드 중 이동 감지 지점) */
export function emitMoverCaught(mover: Mover): void {
  mover.status = MoverStatus.CAUGHT;
  gameBus.emit("mover:caught", { moverId: mover.id });
}

/** RED 중 균형 보정 경고 누적 발행(탈락 여부는 호출측이 판단). */
export function emitMoverWarned(mover: Mover): void {
  gameBus.emit("mover:warned", {
    moverId: mover.id,
    warnings: mover.warnings,
  });
}

/** 무버 완주 처리하고 이벤트 발행. (도착선 진입 지점) */
export function emitMoverFinished(mover: Mover): void {
  mover.status = MoverStatus.FINISHED;
  mover.cargoDelivered = mover.cargo;
  gameBus.emit("mover:finished", {
    moverId: mover.id,
    cargoDelivered: mover.cargoDelivered,
  });
}
