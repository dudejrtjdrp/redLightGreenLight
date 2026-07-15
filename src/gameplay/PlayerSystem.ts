/**
 * PlayerSystem.ts (Phase 4 개정: Balance Kick)
 * 무버 1명의 매 스텝 처리:
 *   입력(W 전진 / A·D 균형) → 전진·좌우 이동 → tilt 적분 → 낙하(초과 시) → RED 판정 → 완주.
 *
 * 낙하는 더 이상 "급정지=무조건 낙하"가 아니다.
 *   급정지는 tilt에 킥만 준다. 안 잡으면 tilt가 쏠려 |tilt|>threshold에서 위쪽 짐부터 떨어진다.
 *   A/D로 되잡으면 낙하를 막을 수 있다(단 RED에선 경고 누적).
 *
 * RED 딜레마(승인 규칙: 옵션2 + 경고 누적):
 *   - W 전진(속도 임계 초과) → 즉시 탈락.
 *   - A/D 균형 보정 → 경고 +1(디바운스). 누적 ≥ warningMax → 탈락.
 *   - 안 잡으면 짐 낙하(점수 손해, 생존 유지). → "잡히거나 vs 흘리거나"의 선택.
 */

import { GameBalance } from "../config/GameBalance";
import { BalanceConfig } from "../config/BalanceConfig";
import { PlayerConfig } from "../config/PlayerConfig";
import { Mover, MoverStatus } from "./Mover";
import { RoundStateMachine } from "./RoundStateMachine";
import { RoundPhase } from "./RoundState";
import { InputController } from "../input/InputController";
import { stepMovement } from "./MovementSystem";
import { CargoSystem } from "./CargoSystem";
import {
  integrateTilt,
  applyStopImpulse,
  applyCounter,
  applySettleAssist,
  applyWalkSway,
  updateDangerState,
  tiltDropCount,
  relieveAfterDrop,
} from "./BalanceSystem";
import {
  emitMoverCaught,
  emitMoverFinished,
  emitMoverWarned,
} from "./GameplayEvents";

export class PlayerSystem {
  private prevHolding = false;
  private prevPhase: RoundPhase = RoundPhase.LOBBY;
  /** 스무딩된 좌우 입력(연속). 급격한 튐 방지. */
  private smoothLateral = 0;
  /** 걸음 커플 sway용 스텝 위상(전진 거리 누적 기반). */
  private balanceStepPhase = 0;

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

    this.handlePhaseTransition();

    this.mover.speedMode = this.input.speedMode;
    const holding = this.input.isForward;
    const rawLateral = this.input.lateral; // -1/0/+1 (경고 판정용, 즉각)

    // 입력 스무딩(연속값): 급격한 튐 방지.
    this.smoothLateral +=
      (rawLateral - this.smoothLateral) *
      Math.min(1, BalanceConfig.inputSmoothing * dt);

    // --- 전진(z) ---
    const speed = stepMovement(this.mover, holding, dt);

    // --- 급정지 킥: W를 놓는 순간 속도가 v안전 초과면 tilt에 임펄스 ---
    if (this.prevHolding && !holding && speed > BalanceConfig.safeSpeed) {
      applyStopImpulse(this.mover, speed);
    }
    this.prevHolding = holding;

    // --- 좌우 이동 + counter-torque(되잡기): 스무딩된 연속 입력으로 항상 적용 ---
    this.moveLateral(this.smoothLateral, dt);
    applyCounter(this.mover, this.smoothLateral, dt);

    // 정규화 전진속도(0=정지 → 얼어붙음, 1=최대 → 최대 흔들림).
    const fwdSpeed = Math.abs(this.mover.velocity.z);
    const moveFactor = Math.min(1, fwdSpeed / PlayerConfig.baseMoveSpeed);

    // --- 입력 중립 시 약한 settle-assist(이동 중에만; 정지 시엔 홀드 유지) ---
    if (rawLateral === 0 && moveFactor > 0.05) {
      applySettleAssist(this.mover, dt);
    }

    // --- 걸음 커플 좌우 sway(직진해도 흔들림). 전진 거리로 스텝 위상 누적. ---
    this.balanceStepPhase +=
      ((fwdSpeed * dt) / BalanceConfig.walkStride) * Math.PI * 2;
    applyWalkSway(this.mover, this.balanceStepPhase, moveFactor, dt);

    // --- 불안정성 적분(이동 비례; 정지 시 tiltVel 감쇠로 그 자리 홀드) ---
    integrateTilt(this.mover, dt, moveFactor);
    // 아슬아슬(danger) 상태 갱신(히스테리시스). 낙하는 이보다 큰 tiltDropThreshold에서만.
    updateDangerState(this.mover);

    // 경고 디바운스 타이머 감소(항상).
    this.mover.warnCooldown = Math.max(0, this.mover.warnCooldown - dt);

    // --- RED 판정 ---
    if (this.round.phase === RoundPhase.RED) {
      // (6) W 전진 이동 → 즉시 탈락
      if (speed > GameBalance.judge.moveThreshold) {
        console.log("[OUT] RED 전진(W) → 즉시 탈락");
        emitMoverCaught(this.mover);
        this.round.registerActivity();
        return;
      }
      // (7) A/D 균형 보정 → 경고(디바운스: 보정 이벤트당 1회). 즉각 입력(rawLateral) 기준.
      if (rawLateral !== 0 && this.mover.warnCooldown <= 0) {
        this.mover.warnings += 1;
        this.mover.warnCooldown = BalanceConfig.warningCooldown;
        // [RED 딜레마 검증] 균형을 잡으면 낙하는 막지만 경고를 소모한다.
        console.log(
          `[RED-DILEMMA] 균형보정 선택 → 경고 ${this.mover.warnings}/${BalanceConfig.warningMax}` +
            ` (짐 안 흘림, 대신 경고 소모)`,
        );
        emitMoverWarned(this.mover);
        this.round.registerActivity();
        if (this.mover.warnings >= BalanceConfig.warningMax) {
          console.log("[OUT] 경고 누적 초과 → 탈락 (균형만 잡다 잡힘)");
          emitMoverCaught(this.mover); // 경고 초과 탈락(잡기 보너스 적용)
          return;
        }
      }
    }

    // --- 낙하: |tilt| 초과 시 위쪽 짐부터(초과량 비례) ---
    const drops = tiltDropCount(this.mover);
    if (drops > 0) {
      const dropped = this.cargo.dropFrom(this.mover, drops);
      if (dropped > 0) {
        relieveAfterDrop(this.mover); // 스택 낮아짐 → 자기보정
        this.round.registerActivity();
        // [RED 딜레마 검증] RED에서 안 잡으면 짐을 흘려 생존(점수 손해).
        if (this.round.phase === RoundPhase.RED) {
          console.log(
            `[RED-DILEMMA] 안 잡음 → 짐 ${dropped}개 흘림 (생존 유지, 점수 손해)`,
          );
        }
      }
    }

    // --- 완주 판정 ---
    if (this.mover.position.z <= this.finishZ) {
      this.mover.position.z = this.finishZ;
      emitMoverFinished(this.mover);
    }
  }

  /** RED 진입 시 warningScope="red"면 경고 리셋. */
  private handlePhaseTransition(): void {
    const phase = this.round.phase;
    if (phase === this.prevPhase) return;
    if (phase === RoundPhase.RED && BalanceConfig.warningScope === "red") {
      this.mover.warnings = 0;
    }
    this.prevPhase = phase;
  }

  private moveLateral(dir: number, dt: number): void {
    this.mover.position.x += dir * BalanceConfig.lateralMoveSpeed * dt;
    const half = GameBalance.track.laneHalfWidth;
    if (this.mover.position.x > half) this.mover.position.x = half;
    else if (this.mover.position.x < -half) this.mover.position.x = -half;
  }
}
