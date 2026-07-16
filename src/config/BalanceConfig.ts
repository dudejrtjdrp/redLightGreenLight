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

  /** 아슬아슬 시작(맨 위 짐이 가장자리에 걸침). 아직 낙하 X, 위험 연출만. */
  tiltDangerThreshold: number;
  /** 히스테리시스: danger 진입 후 이 값 아래로 내려오면 복구(깜빡임 방지). */
  tiltDangerRecover: number;
  /** danger 구간 추가 감쇠(넘어가기 직전 "어어어" 하며 가장자리에 머물게). */
  dangerDamping: number;

  /** |tilt| 이 값을 넘겨야 실제로 맨 위 짐이 탈락(진짜 한계, danger보다 확실히 큼). */
  tiltDropThreshold: number;
  /** 초과량 → 낙하 개수 단위(ceil(over/step)). */
  tiltDropStep: number;
  /** 낙하 후 tilt를 곱해 완화(자기보정). */
  tiltReliefFactor: number;
  /** 낙하 짐이 바깥으로 밀려나 착지하는 수평 거리(회수 위치 = 착지점). */
  dropLandingSpread: number;

  /**
   * 정지 시 tiltVel 감쇠율(braceAmt에 비례). 진동만 멈추고 tilt 값은 그 자리 유지
   * = 멈춘 자세로 얼어붙음. 중앙(tilt=0)으로 스냅하지 않음.
   */
  stopDamping: number;
  /**
   * 이동량(정규화 전진속도) → 불안정/드리프트 계수.
   * 멈추면 불안정≈0, 움직일 때만 흔들리게. (activity = min(1, moveFactor*이 값))
   */
  moveInstabilityScale: number;
  /** 걸음 커플 좌우 sway 임펄스 크기(직진해도 흔들리게). */
  walkSwayGain: number;
  /** sway의 발걸음 연동 강도. */
  walkSwayStepCoupling: number;
  /** sway 스텝 위상 1사이클(2π)당 전진 거리(유닛). */
  walkStride: number;

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

  /** 주 쏠림 드리프트 세기(진동 아닌 "지속 방향 기울기"의 주력). */
  leanDriftGain: number;
  /** 쏠림 방향(driftBias) random-walk 전환 속도(느릴수록 한 방향을 오래 유지). */
  leanDirChangeRate: number;
  /** 쏠림 방향 절대값 상한. */
  driftMax: number;
  /** 속도 비례 쏠림 증가 계수: ×(1 + speedLeanScale×정규화속도). */
  speedLeanScale: number;
  /** 결승선 근접 비례 쏠림 증가 계수: ×(1 + finishLeanScale×근접도). */
  finishLeanScale: number;

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

  tiltDangerThreshold: 1.0,
  tiltDangerRecover: 0.72,
  dangerDamping: 3.5,

  tiltDropThreshold: 1.7, // 진짜 한계(과거 1.0 → 크게 상향: 중간 기울기로는 안 떨어짐)
  tiltDropStep: 0.5,
  tiltReliefFactor: 0.45,
  dropLandingSpread: 0.8,

  stopDamping: 9.0,
  moveInstabilityScale: 1.6,
  // 참고: damping은 아래 값. 매끄러움을 위해 소폭 상향.
  walkSwayGain: 0, // 걸음 좌우 진동 완전 제거(흔들림 없음)
  walkSwayStepCoupling: 1.0,
  walkStride: 0.9,

  instabilityGain: 3.4, // inverted-pendulum 증폭 상향(기운 뒤 더 급하게 커짐)
  instabilityNoise: 0, // 지터 완전 제거(짐 떨림 없음). 쏠림은 leanDrift(부드러운 방향 변화)가 담당.
  damping: 2.6, // 소폭 상향(tiltVel 매끄럽게, 미세 진동 억제)
  stackHeightSensitivity: 0.3,

  counterTorque: 10.0,
  lateralMoveSpeed: 2.2,
  inputSmoothing: 14.0,
  settleAssist: 1.0, // 스프링 복원 하향(진동 감소)
  centerDeadzone: 0.06,

  leanDriftGain: 14.0, // 주력: 지속 방향 쏠림(가만히 직진하면 ~0.5초 내 확 기울 정도)
  leanDirChangeRate: 0.5, // 방향은 서서히 전환(저주파)
  driftMax: 1.0,
  speedLeanScale: 1.1, // 빠를수록 특히 더 크게
  finishLeanScale: 1.4, // 종반에 특히 더 크게

  maxTilt: 3.2, // 최대 쏠림 폭 확대(더 큰 각까지 도달; danger/drop 임계는 그대로)
  maxTiltVel: 11.0, // 더 빠른 쏠림 속도 허용

  warningMax: 3,
  warningCooldown: 0.35,
  warningScope: "round",
};
