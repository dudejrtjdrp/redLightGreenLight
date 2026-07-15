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

/** 매 프레임 불안정성 적분(양성 피드백 + 드리프트 + 노이즈 + 감쇠). 짐 없으면 안정. */
export function integrateTilt(mover: Mover, dt: number): void {
  if (mover.cargo <= 0) {
    mover.tilt = 0;
    mover.tiltVel = 0;
    mover.driftBias = 0;
    mover.inDanger = false;
    return;
  }
  const hf = stackHeightFactor(mover.cargo);

  // 상시 드리프트: 방향이 서서히 바뀌는 random-walk 바이어스(직진해도 쏠림).
  mover.driftBias +=
    (Math.random() * 2 - 1) * BalanceConfig.driftNoiseScale * dt;
  if (mover.driftBias > BalanceConfig.driftMax) mover.driftBias = BalanceConfig.driftMax;
  else if (mover.driftBias < -BalanceConfig.driftMax) mover.driftBias = -BalanceConfig.driftMax;

  // 양성 피드백 + 드리프트 주입.
  mover.tiltVel += BalanceConfig.instabilityGain * mover.tilt * hf * dt;
  mover.tiltVel += BalanceConfig.straightDriftGain * mover.driftBias * dt;

  // 미세 노이즈는 데드존 밖에서만(중심 근처 떨림 제거).
  if (Math.abs(mover.tilt) >= BalanceConfig.centerDeadzone) {
    mover.tiltVel +=
      (Math.random() * 2 - 1) * BalanceConfig.instabilityNoise * dt;
  }

  // 감쇠(마찰). danger 구간에선 추가 감쇠로 가장자리에 머물게("어어어").
  const damp = mover.inDanger
    ? BalanceConfig.damping + BalanceConfig.dangerDamping
    : BalanceConfig.damping;
  mover.tiltVel -= mover.tiltVel * damp * dt;
  mover.tilt += mover.tiltVel * dt;

  // 데드존: 중심 근처 저속이면 미세 떨림을 적극 감쇠(완전 정지는 아님).
  if (
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

/** A/D 되잡기. dir: -1(A/좌) / +1(D/우). 쏠린 쪽으로 움직여 tilt를 0 근처로. */
export function applyCounter(mover: Mover, dir: number, dt: number): void {
  mover.tiltVel -= BalanceConfig.counterTorque * dir * dt;
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
