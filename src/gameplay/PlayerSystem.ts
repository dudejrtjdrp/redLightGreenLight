/**
 * PlayerSystem.ts
 * 무버 1명(플레이어)의 매 스텝 처리:
 *   입력 → 이동 → (급정지 낙하 판정) → 레드라이트 판정 → 완주 판정.
 * v1 싱글용 오케스트레이션. 규칙 소유는 여기, 수치는 전부 Config.
 *
 * 급정지 낙하(Phase 4):
 *   "전진 중 release" = 급정지 시도. 이때 정지 직전 속도 vStop을 정규화(=fast 최대속도 기준)해 기록하고,
 *   모드별 안정화 창(빠름 ~1.0s / 신중 ~0.3s) 동안 "낙하 판정 창"을 유지한다.
 *   창 종료 또는 완전 정지 시:  낙하수 = ceil((vStopNorm − safeSpeed) / step).
 *   → 빠름 풀스피드(norm 1.0): 2~3개, 신중 풀스피드(norm 0.5): ~1개, 안전속도 이하: 0개.
 *   실제 강체 시뮬레이션 없음 — 감속 크기(정지 직전 속도)만으로 규칙적으로 산출.
 */

import { GameBalance } from "../config/GameBalance";
import { PlayerConfig } from "../config/PlayerConfig";
import { Mover, MoverStatus, SpeedMode } from "./Mover";
import { RoundStateMachine } from "./RoundStateMachine";
import { RoundPhase } from "./RoundState";
import { InputController } from "../input/InputController";
import { stepMovement } from "./MovementSystem";
import { CargoSystem } from "./CargoSystem";
import { emitMoverCaught, emitMoverFinished } from "./GameplayEvents";

export class PlayerSystem {
  // 급정지 낙하 판정 상태
  private prevHolding = false;
  private stabilizing = false;
  private stabTimer = 0;
  private vStopNorm = 0;

  /** vStop 정규화 기준: fast 최대속도(=norm 1.0). */
  private readonly fastMaxSpeed =
    PlayerConfig.baseMoveSpeed * GameBalance.speed.fast;

  constructor(
    private readonly mover: Mover,
    private readonly input: InputController,
    private readonly round: RoundStateMachine,
    private readonly cargo: CargoSystem,
  ) {}

  get finishZ(): number {
    return GameBalance.track.startZ - GameBalance.track.length;
  }

  get progress(): number {
    const traveled = GameBalance.track.startZ - this.mover.position.z;
    return Math.min(1, Math.max(0, traveled / GameBalance.track.length));
  }

  update(dt: number): void {
    if (this.mover.status !== MoverStatus.ALIVE) return;

    this.mover.speedMode = this.input.speedMode;
    const holding = this.input.isForward;

    const speed = stepMovement(this.mover, holding, dt);

    // --- 급정지 낙하 판정 창 ---
    this.updateDropWindow(holding, speed, dt);

    // --- 레드라이트 즉시 탈락 (GREEN/TELL 이동은 정상) ---
    if (
      this.round.phase === RoundPhase.RED &&
      speed > GameBalance.judge.moveThreshold
    ) {
      emitMoverCaught(this.mover);
      this.round.registerActivity();
      return;
    }

    // --- 완주 판정 ---
    if (this.mover.position.z <= this.finishZ) {
      this.mover.position.z = this.finishZ;
      emitMoverFinished(this.mover);
    }
  }

  /**
   * 급정지 낙하 판정 창 관리.
   *  - 전진 중 release(속도>임계) → 창 개시, vStop 기록.
   *  - 창 도중 다시 전진 → 급정지 취소(정지 안 함).
   *  - 완전 정지 또는 창 만료 → 낙하수 계산 후 CargoSystem에 위임.
   */
  private updateDropWindow(holding: boolean, speed: number, dt: number): void {
    const threshold = GameBalance.judge.moveThreshold;

    // release 순간 감지 → 안정화(낙하 판정) 창 개시
    if (this.prevHolding && !holding && speed > threshold && !this.stabilizing) {
      this.stabilizing = true;
      const isFast = this.mover.speedMode === SpeedMode.FAST;
      this.stabTimer = isFast
        ? GameBalance.stabilize.fast
        : GameBalance.stabilize.careful;
      this.vStopNorm = speed / this.fastMaxSpeed;
    }

    // 다시 전진하면 급정지 취소
    if (this.stabilizing && holding) {
      this.stabilizing = false;
    }

    // 창 진행 → 정지 완료 또는 만료 시 낙하 확정
    if (this.stabilizing) {
      this.stabTimer -= dt;
      if (speed <= threshold || this.stabTimer <= 0) {
        this.resolveDrop();
        this.stabilizing = false;
      }
    }

    this.prevHolding = holding;
  }

  /** 낙하수 = ceil((vStopNorm − safeSpeed) / step). 보유량으로 상한. */
  private resolveDrop(): void {
    const { safeSpeed, step } = GameBalance.dropModel;
    const raw = Math.ceil((this.vStopNorm - safeSpeed) / step);
    const drops = Math.max(0, Math.min(raw, this.mover.cargo));
    if (drops <= 0) return;

    const dropped = this.cargo.dropFrom(this.mover, drops);
    // 낙하도 RED 중 '활동'이면 빈 턴 아님(그린타임 반환 방지).
    if (dropped > 0) this.round.registerActivity();
  }
}
