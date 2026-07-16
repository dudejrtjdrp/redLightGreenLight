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
   * @deprecated Phase 4 개정(Balance Kick)으로 사용 중단.
   *   낙하는 이제 tilt 기반(BalanceConfig)으로 판정한다. 급정지는 tilt에 킥만 준다.
   *   히스토리/롤백 참고용으로만 남김.
   *
   * FAKE PHYSICS 낙하 모델(구).
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

  /**
   * 점수 규칙 — "북극성" 튜닝 손잡이 집합.
   * 기대 술래 점수 ≈ 기대 1등 무버 점수가 되도록 아래 값만 조절한다.
   * 관련 손잡이:
   *   - survivorBonusK : 생존 희소성 보너스 크기(무버측 후반 가속).
   *   - dropPointScale : 낙하 1개당 술래 점수 배율(술래측 파밍 가치).
   *   - catchBonusScale: 잡기 가속 보너스 배율(술래측 후반 가속).
   *   - 짐 상한(=무버 점수 상한)은 ItemConfig.maxPerPlayer / PlayerConfig.startingCargo.
   */
  score: {
    /** 짐 1개 = 1점 (무버 반입 짐 점수) */
    cargoPoint: 1,
    /**
     * 생존 보너스 상수 K. 1인당 보너스 = K / 생존자수.
     * Phase 9 튜닝(봇 시뮬 4,000라운드): 28 → 20.
     * 인원수 보정 도입으로 K를 낮춰도 무버 승률 47~59% 유지.
     */
    survivorBonusK: 20,
    /**
     * 낙하 짐 1개당 술래 점수 배율(최종 정산에만 적용).
     * Phase 9 튜닝: 0.6 → 1.8. 낙하의 "자해 스윙"을 키워 술래 파밍 가치 강화.
     * (인원수 보정과 세트 — 보정 없이 1.8만 올리면 다인전에서 술래가 압승)
     */
    dropPointScale: 1.8,
    /**
     * 잡은 인원 보너스(가속): c번째로 잡으면 c점, 누적 c(c+1)/2.
     * Phase 9 튜닝: 1 → 0.9 (근소 하향, 잡기 드라마는 유지).
     */
    catchBonusScale: 0.9,
    /**
     * ★ Phase 9 신규: 술래 점수 인원수 보정.
     * 술래의 기대 점수원(낙하/잡기)은 무버 수에 비례해 커지지만 1등 무버 점수는
     * 인원과 무관 → 단일 배율로는 인원별 밸런스 불가(시뮬로 확인).
     * 최종 술래 점수 × (ref / 무버수)^power 로 정규화.
     * 봇 시뮬 결과: ref=4, power=1일 때 무버 2~7인 전 구간 술래 승률 41~53%.
     */
    seekerCountNorm: {
      ref: 4,
      power: 1,
    },
  },

  /** 트랙/라운드 */
  round: {
    /**
     * 라운드 최대 시간(초). 이 시간 또는 전원 완주/탈락 시 종료.
     * 홈/봇 모드 개정: 고정 1분 30초(90s). 상단 타이머 표시 기준.
     */
    maxDurationMin: 90,
    maxDurationMax: 90,
    /** 중속으로 완주까지 필요한 그린 창 횟수(트랙 길이 튜닝 기준) */
    greenWindowsToFinishMin: 6,
    greenWindowsToFinishMax: 10,
  },

  /**
   * 트랙 형상(월드 유닛).
   * ⚠ Phase 3 추가 노브. 전진 방향은 -z. 완주선 z = startZ - length.
   *   length는 "중속으로 그린 창 6~10회 완주" 기준의 튜닝 대상.
   */
  track: {
    startZ: 0,
    length: 32,
    /**
     * 좌우 레인 반폭(무버 좌우 이동 한계). 도로 폭과 일치하도록 확장.
     * 봇 모드 개정: 4.5 → 7.0 (최대 7명이 넓게 돌아다닐 수 있게. MapConfig.scale 연동).
     */
    laneHalfWidth: 7.0,
  },

  /**
   * 판정 임계값.
   * ⚠ Phase 3 추가 노브.
   */
  judge: {
    /** 이 속도(유닛/초) 이하는 "정지"로 간주. RED 중 이 값 초과 시 이동=탈락. */
    moveThreshold: 0.08,
  },
} as const;

export type GameBalanceConfig = typeof GameBalance;
