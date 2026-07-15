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

  /**
   * Phase 3 개정: 짐 개수 기반 속도 배율(itemSpeedFactor) 곡선.
   * 최종속도 = baseMoveSpeed × 속도모드 × itemSpeedFactor(cargo).
   * 짐 0개=최대, 짐 많을수록 느림(선형, 하한 있음).
   *   - maxFactor   : 짐 0개일 때 배율(가장 빠름).
   *   - normalFloor : 정상 상한(referenceCargo개=ItemConfig.maxPerPlayer)일 때 배율(정상 최소).
   *   - minFactor   : 절대 하한. 스캐빈저가 상한 초과로 주워도 이 아래로는 안 느려짐(조작 가능 보장).
   * referenceCargo 초과분은 같은 기울기로 계속 느려지다 minFactor에서 바닥 → 과적 자기제한.
   */
  itemSpeed: {
    maxFactor: 1.4,
    normalFloor: 0.7,
    minFactor: 0.55,
  },
} as const;

export type PlayerConfigType = typeof PlayerConfig;
