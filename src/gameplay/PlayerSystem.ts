/**
 * PlayerSystem.ts
 * 무버 1명(플레이어)의 매 스텝 처리: 입력 → 이동 → 레드라이트 판정 → 완주 판정.
 * v1 싱글용 오케스트레이션. 규칙 소유는 여기, 수치는 전부 Config.
 */

import { GameBalance } from "../config/GameBalance";
import { Mover, MoverStatus } from "./Mover";
import { RoundStateMachine } from "./RoundStateMachine";
import { RoundPhase } from "./RoundState";
import { InputController } from "../input/InputController";
import { stepMovement } from "./MovementSystem";
import { emitMoverCaught, emitMoverFinished } from "./GameplayEvents";

export class PlayerSystem {
  constructor(
    private readonly mover: Mover,
    private readonly input: InputController,
    private readonly round: RoundStateMachine,
  ) {}

  /** 완주선 z 좌표(전진 방향 -z). */
  get finishZ(): number {
    return GameBalance.track.startZ - GameBalance.track.length;
  }

  /** 0~1 진행도. HUD/디버그용. */
  get progress(): number {
    const traveled = GameBalance.track.startZ - this.mover.position.z;
    return Math.min(1, Math.max(0, traveled / GameBalance.track.length));
  }

  update(dt: number): void {
    // 탈락/완주한 무버는 더 이상 처리하지 않음.
    if (this.mover.status !== MoverStatus.ALIVE) return;

    // 입력 반영: 속도모드는 매 스텝 동기화(생존 중에만 조작 가능).
    this.mover.speedMode = this.input.speedMode;
    const holding = this.input.isForward;

    // fake-physics 이동 적분.
    const speed = stepMovement(this.mover, holding, dt);

    // 레드라이트 즉시 탈락: RED에서 속도 임계 초과 시 아웃.
    // (GREEN/TELL 중 이동은 정상 — 여기서 판정하지 않음)
    if (
      this.round.phase === RoundPhase.RED &&
      speed > GameBalance.judge.moveThreshold
    ) {
      emitMoverCaught(this.mover);
      this.round.registerActivity(); // 빈 턴 아님(활동 발생)
      return;
    }

    // 완주 판정: 완주선 도달 시 FINISHED + 이벤트.
    if (this.mover.position.z <= this.finishZ) {
      this.mover.position.z = this.finishZ;
      emitMoverFinished(this.mover);
    }
  }
}
