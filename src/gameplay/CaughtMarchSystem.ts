/**
 * CaughtMarchSystem.ts
 * 무궁화꽃 원작 연출: 잡힌(탈락) 무버가 술래 옆으로 걸어가 잡힌 순서대로 줄을 선다.
 *
 *  - mover:caught 구독 → 잡힌 순서(i)대로 줄자리 배정:
 *      x = side × (lineStartX + i × spacing),  z = 완주선 − 술래 standoffZ (술래와 같은 줄).
 *  - ★ 가는 길에 들고 있던 짐을 전부 흘린다(경로에 균등 분배) → 뒤 무버가 회수 가능.
 *      라운드 진행 중 낙하는 술래 가점(기존 낙하 규칙), 라운드 종료 후엔 가점 없는 forfeit.
 *  - update(dt)에서 목표까지 걸어감. mover.velocity를 채워 렌더 레이어(걷기 애니/조향)가
 *    자연스럽게 따라오게 한다(탈락자 전용 이동 코드는 여기 한 곳뿐).
 *  - 탈락자는 PlayerSystem이 스킵(ALIVE 아님)하므로 판정/짐 로직과 충돌 없음.
 */

import { gameBus } from "../core/EventBus";
import { GameBalance } from "../config/GameBalance";
import { EffectConfig } from "../config/EffectConfig";
import { Mover } from "./Mover";
import { CargoSystem } from "./CargoSystem";
import { RoundStateMachine } from "./RoundStateMachine";
import "./GameplayEvents";

interface MarchState {
  x: number;
  z: number;
  /** 다음 낙하까지 남은 이동 거리. */
  nextDropIn: number;
  /** 낙하 간격(경로 길이 / (짐 + 1) — 경로에 균등 분배). */
  dropEvery: number;
}

export class CaughtMarchSystem {
  /** 이동 중인 탈락자: mover id → 줄 목표/낙하 상태. */
  private readonly marching = new Map<number, MarchState>();
  private readonly moverById = new Map<number, Mover>();
  private caughtCount = 0;

  constructor(
    movers: readonly Mover[],
    private readonly cargo: CargoSystem,
    private readonly round: RoundStateMachine,
  ) {
    for (const m of movers) this.moverById.set(m.id, m);
    gameBus.on("mover:caught", this.onCaught);
  }

  private readonly onCaught = ({ moverId }: { moverId: number }): void => {
    const mover = this.moverById.get(moverId);
    if (!mover || this.marching.has(moverId)) return;
    const c = EffectConfig.caughtMarch;
    const finishZ = GameBalance.track.startZ - GameBalance.track.length;
    const idx = this.caughtCount++;
    const tx = c.side * (c.lineStartX + idx * c.spacing);
    const tz = finishZ - EffectConfig.seeker.standoffZ;
    // 짐을 경로에 균등 분배(최소/최대 간격 클램프).
    const pathLen = Math.hypot(tx - mover.position.x, tz - mover.position.z);
    const dropEvery = Math.min(
      c.dropEveryMax,
      Math.max(c.dropEveryMin, pathLen / (mover.cargo + 1)),
    );
    this.marching.set(moverId, {
      x: tx,
      z: tz,
      dropEvery,
      nextDropIn: dropEvery * 0.5, // 첫 낙하는 반 간격 뒤(잡힌 자리 바로는 아님)
    });
  };

  /** 매 스텝: 탈락자를 줄자리로 걷게 하고, 가는 길에 짐을 흘린다. */
  update(dt: number): void {
    if (this.marching.size === 0 || dt <= 0) return;
    const c = EffectConfig.caughtMarch;
    for (const [id, st] of this.marching) {
      const m = this.moverById.get(id);
      if (!m) {
        this.marching.delete(id);
        continue;
      }
      const dx = st.x - m.position.x;
      const dz = st.z - m.position.z;
      const dist = Math.hypot(dx, dz);
      if (dist <= c.arriveEps) {
        // 도착: 자리에 스냅 + 정지. 남은 짐은 자리에서 전부 내려놓는다.
        m.position.x = st.x;
        m.position.z = st.z;
        m.velocity.x = 0;
        m.velocity.z = 0;
        if (m.cargo > 0) this.cargo.dropFrom(m, m.cargo, this.round.isActive);
        this.marching.delete(id);
        continue;
      }
      const sp = Math.min(c.walkSpeed, dist / dt);
      const step = sp * dt;
      m.velocity.x = (dx / dist) * sp;
      m.velocity.z = (dz / dist) * sp;
      m.position.x += m.velocity.x * dt;
      m.position.z += m.velocity.z * dt;

      // 가는 길에 짐 흘리기(뒤 무버가 주울 수 있게 트랙에 잔류).
      if (m.cargo > 0) {
        st.nextDropIn -= step;
        if (st.nextDropIn <= 0) {
          this.cargo.dropFrom(m, 1, this.round.isActive);
          st.nextDropIn += st.dropEvery;
        }
      }
    }
  }

  dispose(): void {
    gameBus.off("mover:caught", this.onCaught);
    this.marching.clear();
  }
}
