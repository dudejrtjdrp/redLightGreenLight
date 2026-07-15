/**
 * BalanceConfig.ts
 * Phase 4 개정: 스택 균형 킥(Balance Kick) 모델 수치. 하드코딩 금지 원칙에 따라 분리.
 * 개별 강체 없음 — 무버 1명당 스칼라 tilt/tiltVel 하나로 스택 전체를 표현.
 * 전부 튜닝 대상.
 */

export type WarningScope = "round" | "red";

export interface BalanceConfigShape {
  /** v안전: 이 속력 이하로 멈추면 급정지 킥 없음(유닛/초). */
  safeSpeed: number;
  /** 급정지 킥 세기: tiltVel += impulseScale * max(0, vStop - safeSpeed) * 방향. */
  impulseScale: number;

  /** |tilt| 이 값을 넘으면 위쪽 짐부터 낙하. */
  tiltDropThreshold: number;
  /** 초과량 → 낙하 개수 단위(ceil(over/step)). */
  tiltDropStep: number;
  /** 낙하 후 tilt를 곱해 완화(자기보정). */
  tiltReliefFactor: number;

  /** 불안정 양성 피드백 계수(안 잡으면 쏠려 넘어감). */
  instabilityGain: number;
  /** 미세 흔들림 노이즈(완전 정지 상태에서도 서서히 쏠리게). */
  instabilityNoise: number;
  /** tiltVel 감쇠(마찰) 계수(초당 비율). */
  damping: number;
  /** 짐 1개당 불안정 가산: stackHeightFactor = 1 + sensitivity*cargo. "탐욕이 곧 불안정". */
  stackHeightSensitivity: number;

  /** A/D 되잡기 세기(counter-torque). */
  counterTorque: number;
  /** A/D 좌우 이동 속도(유닛/초). */
  lateralMoveSpeed: number;
  /** 입력 스무딩 속도(초당). 높을수록 즉각적, 낮을수록 부드럽게 램프(급격한 튐 방지). */
  inputSmoothing: number;
  /** 입력 중립일 때 중심으로 끌어오는 약한 복원(자동복구는 아님). */
  settleAssist: number;
  /** 중심 근처 미세 떨림 제거 데드존(|tilt| 이 값 미만이면 노이즈 억제/감쇠). */
  centerDeadzone: number;

  /** 직진 중에도 tiltVel에 주입되는 상시 드리프트 바이어스 세기(0=끔). */
  straightDriftGain: number;
  /** 드리프트 바이어스의 random-walk 노이즈 스케일(방향이 서서히 바뀜). */
  driftNoiseScale: number;
  /** 드리프트 바이어스 절대값 상한. */
  driftMax: number;

  /** 안전장치: tilt/tiltVel 절대값 상한(시각 폭주 방지). */
  maxTilt: number;
  maxTiltVel: number;

  /** RED 중 균형(A/D) 보정 누적 상한. 초과 시 탈락. */
  warningMax: number;
  /** 경고 디바운스(초). 연속 홀드로 순삭 방지 — 보정 이벤트당 1회. */
  warningCooldown: number;
  /** 경고 누적 범위: "round"=라운드 내내 누적(기본), "red"=RED마다 리셋. */
  warningScope: WarningScope;
}

export const BalanceConfig: BalanceConfigShape = {
  safeSpeed: 1.2,
  impulseScale: 0.8,

  tiltDropThreshold: 1.0,
  tiltDropStep: 0.5,
  tiltReliefFactor: 0.45,

  instabilityGain: 2.0,
  instabilityNoise: 0.5,
  damping: 2.0,
  stackHeightSensitivity: 0.3,

  counterTorque: 10.0,
  lateralMoveSpeed: 2.2,
  inputSmoothing: 14.0,
  settleAssist: 2.6,
  centerDeadzone: 0.06,

  straightDriftGain: 1.3,
  driftNoiseScale: 1.6,
  driftMax: 1.0,

  maxTilt: 2.5,
  maxTiltVel: 8.0,

  warningMax: 3,
  warningCooldown: 0.35,
  warningScope: "round",
};
