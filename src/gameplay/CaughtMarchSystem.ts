/**
 * CaughtMarchSystem.ts
 * 무궁화꽃 원작 연출: 잡힌(탈락) 무버가 술래 옆으로 걸어가 잡힌 순서대로 줄을 선다.
 *
 *  - mover:caught 구독 → 잡힌 순서(i)대로 줄자리 배정:
 *      x = side × (lineStartX + i × spacing),  z = 완주선 − 술래 standoffZ (술래와 같은 줄).
 *  - update(dt)에서 목표까지 걸어감. mover.velocity를 채워 렌더 레이어(걷기 애니/조향)가
 *    자연스럽게 따라오게 한다(탈락자 전용 이동 코드는 여기 한 곳뿐).
 *  - 탈락자는 PlayerSystem이 스킵(ALIVE 아님)하므로 판정/짐 로직과 충돌 없음.
 */

import { gameBus } from "../core/EventBus";
import { GameBalance } from "../config/GameBalance";
import { EffectConfig } from "../config/EffectConfig";
import { Mover } from "./Mover";
import "./GameplayEvents";

interface Target {
  x: number;
  z: number;
}

export class CaughtMarchSystem {
  /** 이동 중인 탈락자: mover id → 줄 목표 좌표. */
  private readonly marching = new Map<number, Target>();
  private readonly moverById = new Map<number, Mover>();
  private caughtCount = 0;

  constructor(movers: readonly Mover[]) {
    for (const m of movers) this.moverById.set(m.id, m);
    gameBus.on("mover:caught", this.onCaught);
  }

  private readonly onCaught = ({ moverId }: { moverId: number }): void => {
    const mover = this.moverById.get(moverId);
    if (!mover || this.marching.has(moverId)) return;
    const c = EffectConfig.caughtMarch;
    const finishZ = GameBalance.track.startZ - GameBalance.track.length;
    const idx = this.caughtCount++;
    this.marching.set(moverId, {
      x: c.side * (c.lineStartX + idx * c.spacing),
      z: finishZ - EffectConfig.seeker.standoffZ,
    });
  };

  /** 매 스텝: 탈락자를 줄자리로 걷게 한다(도착 시 정지·정렬). */
  update(dt: number): void {
    if (this.marching.size === 0 || dt <= 0) return;
    const c = EffectConfig.caughtMarch;
    for (const [id, target] of this.marching) {
      const m = this.moverById.get(id);
      if (!m) {
        this.marching.delete(id);
        continue;
      }
      const dx = target.x - m.position.x;
      const dz = target.z - m.position.z;
      const dist = Math.hypot(dx, dz);
      if (dist <= c.arriveEps) {
        // 도착: 자리에 스냅 + 정지(걷기 애니 → idle 전환).
        m.position.x = target.x;
        m.position.z = target.z;
        m.velocity.x = 0;
        m.velocity.z = 0;
        this.marching.delete(id);
        continue;
      }
      const sp = Math.min(c.walkSpeed, dist / dt);
      m.velocity.x = (dx / dist) * sp;
      m.velocity.z = (dz / dist) * sp;
      m.position.x += m.velocity.x * dt;
      m.position.z += m.velocity.z * dt;
    }
  }

  dispose(): void {
    gameBus.off("mover:caught", this.onCaught);
    this.marching.clear();
  }
}
