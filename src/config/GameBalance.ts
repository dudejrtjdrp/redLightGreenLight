/**
 * GameBalance.ts
 * 게임 전역 밸런스 상수. 프롬프트 0의 "시작 수치 스펙"을 그대로 담는다.
 * 모든 수치는 여기 또는 각 Config에서만 정의한다. 코드 내 하드코딩 금지.
 * 값은 전부 튜닝 대상(북극성: 기대 술래 점수 ≈ 기대 1등 무버 점수).
 */

export const GameBalance = {
  /** 속도 모드 배율 (무버 이동) */
  speed: {
    /** 빠름 모드: 최대 속도 100% */
    fast: 1.0,
    /** 신중 모드: 최대 속도 50% */
    careful: 0.5,
  },

  /** 정지 후 짐이 안정화되기까지 걸리는 시간(초) */
  stabilize: {
    /** 빠름 모드에서 정지 시 안정화 시간 */
    fast: 1.0,
    /** 신중 모드에서 정지 시 안정화 시간 */
    careful: 0.3,
  },

  /** 신호등(술래) 타이밍 */
  signal: {
    /**
     * GREEN(이동 허용) 지속 범위(초).
     * ⚠ 원본 스펙에 GREEN 길이 명시가 없어 Phase 2에서 추가한 튜닝 노브.
     *   트랙 길이 기준("중속으로 그린 창 6~10회 완주")을 맞추기 위한 임시 기본값.
     */
    greenMin: 2.0,
    greenMax: 5.0,
    /** 그린→레드 전환 예고 창(텔). 이 구간에 멈춰야 안전. 고정 범위(초) */
    tellMin: 0.8,
    tellMax: 1.2,
    /** 레드 지속 시간 가변 범위(초) */
    redMin: 1.0,
    redMax: 4.0,
    /**
     * RESOLVE(낙하/체포/점수 정산) 처리 창(초).
     * ⚠ 원본 스펙에 없던 Phase 2 추가 노브. 짐 안정화/정산이 처리될 짧은 고정 창.
     */
    resolveDuration: 0.6,
  },

  /**
   * FAKE PHYSICS 낙하 모델.
   * 낙하 개수 = ceil((vStop - vSafe) / step)
   *  - vStop: 급정지 직전 속도(정규화 0~1)
   *  - vSafe: 이 속도 이하로 멈추면 낙하 없음
   *  - step : 초과 속도 1단계당 낙하 1개
   * 풀스피드(1.0)+5개면 2~3개, 살짝 초과면 1개가 되도록 튜닝.
   */
  dropModel: {
    /** 안전 정지 속도 임계값(이하면 낙하 0) */
    safeSpeed: 0.35,
    /** 초과 속도 → 낙하 개수 변환 단위 */
    step: 0.28,
  },

  /** 점수 규칙 */
  score: {
    /** 짐 1개 = 1점 */
    cargoPoint: 1,
    /** 생존 보너스 상수 K. 1인당 보너스 = K / 생존자수 (8인 기준 K=24) */
    survivorBonusK: 24,
    /**
     * 잡은 인원 보너스(가속): c번째로 잡으면 c점, 누적 c(c+1)/2.
     * (선형 가중치 = c 이므로 별도 상수는 없지만 확장 대비 배율만 노출)
     */
    catchBonusScale: 1,
  },

  /** 트랙/라운드 */
  round: {
    /** 라운드 최대 시간(초). 이 시간 또는 전원 완주/탈락 시 종료 */
    maxDurationMin: 90,
    maxDurationMax: 120,
    /** 중속으로 완주까지 필요한 그린 창 횟수(트랙 길이 튜닝 기준) */
    greenWindowsToFinishMin: 6,
    greenWindowsToFinishMax: 10,
  },
} as const;

export type GameBalanceConfig = typeof GameBalance;
