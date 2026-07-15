/**
 * PlayerConfig.ts
 * 무버(플레이어) 관련 수치. 이동/입력 튜닝 대상.
 */

export const PlayerConfig = {
  /** 무버 기본 최대 이동 속도 (월드 유닛/초). 속도 모드 배율이 여기 곱해진다. */
  baseMoveSpeed: 3.5,

  /** 가속/감속 (유닛/초^2). Fake physics: 실제 강체 아님, 값 보간용 */
  acceleration: 12.0,
  deceleration: 18.0,

  /** 시작 시 보유 짐 개수 (유한, v1 리필 없음) */
  startingCargo: 5,

  /** 무버 시각 반경 (렌더/충돌 판정용) */
  radius: 0.4,
} as const;

export type PlayerConfigType = typeof PlayerConfig;
