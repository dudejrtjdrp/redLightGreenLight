/**
 * BalanceSystem.ts
 * 스택 균형 킥의 fake physics(스칼라만). 무버 1명당 tilt/tiltVel 하나.
 * 개별 짐 강체 없음 — 각 짐의 시각은 tilt에서 파생(MoverView).
 *
 * 모델:
 *  - 불안정성: tiltVel += instabilityGain * tilt * stackHeightFactor * dt  (양성 피드백)
 *              + 노이즈, 그리고 damping으로 tiltVel 감쇠.
 *  - 급정지 킥: tiltVel += impulseScale * max(0, vStop - safeSpeed) * 방향.
 *  - counter-torque(A/D): tiltVel -= counterTorque * dir * dt (쏠린 쪽으로 움직여 되잡기).
 *  - 낙하: |tilt| > threshold 초과량에 비례해 위쪽 짐부터. 낙하 후 tilt 완화(자기보정).
 */

import { BalanceConfig } from "../config/BalanceConfig";
import { Mover } from "./Mover";

/** 스택 높을수록 불안정: 1 + sensitivity*cargo. "탐욕이 곧 불안정". */
export function stackHeightFactor(cargo: number): number {
  return 1 + BalanceConfig.stackHeightSensitivity * cargo;
}

/**
 * 매 프레임 불안정성 적분. 짐 없으면 안정.
 * @param moveFactor 정규화 전진속도(0=정지, 1=최대). 불안정/드리프트는 이동량에 비례,
 *                   정지 시엔 브레이스 복원력이 스택을 중심으로 되돌린다.
 */
export function integrateTilt(
  mover: Mover,
  dt: number,
  moveFactor: number,
  finishProximity: number,
): void {
  if (mover.cargo <= 0) {
    mover.tilt = 0;
    mover.tiltVel = 0;
    mover.driftBias = 0;
    mover.inDanger = false;
    return;
  }
  const hf = stackHeightFactor(mover.cargo);

  // 이동량 → 활동도(activity). 멈추면 0, 조금만 움직여도 빠르게 1로.
  const mf = Math.max(0, Math.min(1, moveFactor));
  const fp = Math.max(0, Math.min(1, finishProximity));
  const activity = Math.min(1, mf * BalanceConfig.moveInstabilityScale);
  const braceAmt = 1 - activity; // 정지에 가까울수록 1

  // 쏠림 방향(driftBias): 느린 random-walk → 순간은 확정 방향, 서서히 좌↔우 전환.
  mover.driftBias +=
    (Math.random() * 2 - 1) * BalanceConfig.leanDirChangeRate * dt;
  if (mover.driftBias > BalanceConfig.driftMax) mover.driftBias = BalanceConfig.driftMax;
  else if (mover.driftBias < -BalanceConfig.driftMax) mover.driftBias = -BalanceConfig.driftMax;

  // 쏠림 크기: 빠를수록 / 결승선 가까울수록 커짐.
  const leanScale =
    (1 + BalanceConfig.speedLeanScale * mf) *
    (1 + BalanceConfig.finishLeanScale * fp);

  // 주력: 지속 방향 쏠림 드리프트(진동 아님).
  mover.tiltVel +=
    BalanceConfig.leanDriftGain * mover.driftBias * leanScale * activity * dt;
  // inverted-pendulum: 현재 기운 방향을 증폭(한쪽으로 넘어가려는 쏠림).
  mover.tiltVel += BalanceConfig.instabilityGain * mover.tilt * hf * activity * dt;

  // 미세 노이즈(감소): 데드존 밖 + 이동 중에만.
  if (Math.abs(mover.tilt) >= BalanceConfig.centerDeadzone) {
    mover.tiltVel +=
      (Math.random() * 2 - 1) * BalanceConfig.instabilityNoise * activity * dt;
  }

  // 감쇠(마찰) + danger 추가 감쇠 + 정지 감쇠.
  //  정지(braceAmt↑) 시 tiltVel만 강하게 죽여 진동을 멈춘다 → tilt 값은 그 자리 홀드.
  //  ※ 중앙(tilt=0)으로 당기는 항은 없음(제자리 고정, 스냅 금지).
  let damp = mover.inDanger
    ? BalanceConfig.damping + BalanceConfig.dangerDamping
    : BalanceConfig.damping;
  damp += BalanceConfig.stopDamping * braceAmt;
  mover.tiltVel -= mover.tiltVel * damp * dt;
  mover.tilt += mover.tiltVel * dt;

  // 데드존 스냅은 "정지 시에만"(braceAmt 높을 때) — 이동 중엔 중앙 attractor 금지.
  //  이동 중에는 leanDrift+instability가 살아 가만두면 쏠려 낙하해야 하므로 센터링을 하지 않는다.
  if (
    braceAmt > 0.5 &&
    Math.abs(mover.tilt) < BalanceConfig.centerDeadzone &&
    Math.abs(mover.tiltVel) < BalanceConfig.centerDeadzone
  ) {
    mover.tilt *= 0.82;
    mover.tiltVel *= 0.6;
  }

  clampBalance(mover);
}

/** 입력 중립 시 중심으로 끌어오는 약한 복원(settle-assist). 완전 자동복구는 아님. */
export function applySettleAssist(mover: Mover, dt: number): void {
  mover.tiltVel -= BalanceConfig.settleAssist * mover.tilt * dt;
}

/**
 * 걸음 커플 좌우 sway 임펄스: 발 디딜 때마다 무게중심이 좌↔우로 이동.
 * 이동속도(moveFactor)에 비례 → 빠를수록 크게 흔들림. 정지 시(moveFactor≈0) 무효.
 * @param stepPhase 전진 거리 기반 스텝 위상(라디안).
 */
export function applyWalkSway(
  mover: Mover,
  stepPhase: number,
  moveFactor: number,
  dt: number,
): void {
  mover.tiltVel +=
    Math.sin(stepPhase) *
    BalanceConfig.walkSwayGain *
    BalanceConfig.walkSwayStepCoupling *
    Math.max(0, Math.min(1, moveFactor)) *
    dt;
}

/**
 * 아슬아슬(danger) 상태 갱신 — 히스테리시스로 깜빡임 방지.
 *  |tilt| ≥ tiltDangerThreshold → danger 진입.
 *  |tilt| ≤ tiltDangerRecover   → danger 해제. (그 사이는 상태 유지)
 */
export function updateDangerState(mover: Mover): void {
  const a = Math.abs(mover.tilt);
  if (a >= BalanceConfig.tiltDangerThreshold) mover.inDanger = true;
  else if (a <= BalanceConfig.tiltDangerRecover) mover.inDanger = false;
}

/** 급정지 킥. vStop = 정지 직전 속력. 빠를수록 큰 킥. */
export function applyStopImpulse(mover: Mover, vStop: number): void {
  const excess = Math.max(0, vStop - BalanceConfig.safeSpeed);
  if (excess <= 0) return;
  const dir =
    Math.abs(mover.tilt) > 1e-3
      ? Math.sign(mover.tilt)
      : Math.random() < 0.5
        ? -1
        : 1;
  mover.tiltVel += BalanceConfig.impulseScale * excess * dir;
  clampBalance(mover);
}

/**
 * A/D 되잡기. dir: -1(A/좌) / +1(D/우). 쏠린 쪽으로 움직여 tilt를 0 근처로.
 * @param controlScale 조작력 배율(기본 1). PlayerSystem이 쏠림 배율(leanScale)과 연동해
 *        전달 → 고속·종반에 drift가 커져도 조작이 항상 이긴다(counterLeanCouple).
 */
export function applyCounter(
  mover: Mover,
  dir: number,
  dt: number,
  controlScale = 1,
): void {
  mover.tiltVel -= BalanceConfig.counterTorque * controlScale * dir * dt;
  clampBalance(mover);
}

/** |tilt| 초과 시 낙하 개수(초과량 비례). 보유량으로 상한. */
export function tiltDropCount(mover: Mover): number {
  const over = Math.abs(mover.tilt) - BalanceConfig.tiltDropThreshold;
  if (over <= 0) return 0;
  const n = Math.ceil(over / BalanceConfig.tiltDropStep);
  return Math.min(n, mover.cargo);
}

/** 낙하 후 스택 완화 → 불안정성 자기보정(짐도 줄어듦). */
export function relieveAfterDrop(mover: Mover): void {
  mover.tilt *= BalanceConfig.tiltReliefFactor;
  mover.tiltVel *= 0.3;
}

/** 안전장치: tilt/tiltVel 절대값 상한. */
export function clampBalance(mover: Mover): void {
  const { maxTilt, maxTiltVel } = BalanceConfig;
  if (mover.tilt > maxTilt) mover.tilt = maxTilt;
  else if (mover.tilt < -maxTilt) mover.tilt = -maxTilt;
  if (mover.tiltVel > maxTiltVel) mover.tiltVel = maxTiltVel;
  else if (mover.tiltVel < -maxTiltVel) mover.tiltVel = -maxTiltVel;
}
