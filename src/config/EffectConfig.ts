/**
 * EffectConfig.ts
 * 시각효과/카메라 상수(밸런스 수치 아님, 연출 튜닝용). 코드 내 하드코딩 금지 원칙에 따라 분리.
 */

export const EffectConfig = {
  /** 짐 스택 흔들림(개별 강체 X, 감쇠 사인 트윈). */
  cargoShake: {
    /** 정지 시 임펄스(작게) */
    impulseStop: 0.35,
    /** 낙하 시 임펄스(크게) */
    impulseDrop: 1.0,
    /** 초당 에너지 감쇠 */
    decayPerSec: 3.5,
    /** 흔들림 주파수 */
    freq: 22,
    /** 최대 기울기(rad) 스케일 */
    maxLean: 0.45,
  },

  /**
   * 낙하 조각 연출(Object Pool 경유).
   * Phase 4 보완: 바닥 피벗 회전 금지 → 수평(±X)으로 밀려나며 떨어지게.
   * spin=0(회전 없음), spread↑(옆으로 밀림), hopUp↓(팝 최소).
   */
  dropEffect: {
    poolSize: 24,
    size: 0.2,
    duration: 1.1,
    gravity: 9.0,
    hopUp: 1.0,
    spread: 1.7,
    spin: 0.0,
  },

  /** 술래 회전(무궁화꽃 텔 연출). */
  seeker: {
    /** 회전 속도(rad/s). TELL(0.8~1.2s) 안에 반바퀴 돌 만큼. */
    turnSpeed: 4.2,
  },

  /**
   * 낙하 아크 연출: 손/스택(from)에서 착지(to)까지 포물선 비행(Object Pool).
   * duration은 CargoSystem의 착지 대기(회수 가능 전환) 시간과 공유.
   */
  dropFlight: {
    poolSize: 24,
    size: 0.2,
    duration: 0.75,
    arcHeight: 0.9,
    tumble: 3.0,
  },

  /** 트랙 위 낙하물 표시 풀 크기(초과분은 표시 생략). */
  droppedPoolSize: 40,

  /** 카메라 무버 추적. */
  camera: {
    back: 9,
    height: 6.5,
    lookAhead: 5,
  },
} as const;

export type EffectConfigType = typeof EffectConfig;
