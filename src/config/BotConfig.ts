/**
 * BotConfig.ts
 * 봇 AI 튜닝 상수(하드코딩 금지 원칙에 따라 분리). 전부 튜닝 대상.
 *
 * 설계 철학: 봇은 사람 플레이를 흉내낸다.
 *  - 반응속도(reaction)가 봇마다 달라 TELL/RED 전환에 대응이 갈린다.
 *  - 공격성(aggression)이 높은 봇은 FAST 모드를 자주 켜고 TELL에서도 늦게 멈춘다.
 *  - RED 딜레마: 균형이 무너질 때 "잡기(경고 소모)" vs "흘리기(짐 손해)"를 성향으로 결정.
 */

export const BotConfig = {
  /** 봇 최대 인원(홈 화면 선택 상한). */
  maxBots: 6,

  /** 페이즈 전환 인지 반응시간(초). 봇마다 [min,max] 균등 샘플. */
  reaction: { min: 0.08, max: 0.32 },

  /** GREEN 진입 후 출발 지연(초). 동시에 우르르 출발하는 부자연스러움 방지. */
  greenStartDelay: { min: 0.05, max: 0.4 },

  /**
   * TELL에서 "더 밀어붙이는" 시간(초) = aggression × tellPushMax.
   * CAREFUL 모드에서만(정지 0.3s로 창 안에 멈출 수 있을 때만) 적용.
   * FAST는 감속에 ~1s가 걸려 밀어붙이면 자살행위 → 반응 즉시 릴리즈.
   */
  tellPushMax: 0.2,

  /** RED 진입 후에도 전진을 못 끊는 지각 확률(사람 실수 모사). */
  redLateChance: 0.015,
  /** 지각 시 추가로 전진을 유지하는 시간(초). 대부분 탈락으로 이어짐. */
  redLateHold: { min: 0.15, max: 0.4 },

  /** 속도 모드 결정: FAST 선택 기본 확률(공격성으로 가감). GREEN마다 재결정. */
  speedChoice: {
    fastBase: 0.25,
    /** aggression 1일 때 fastBase에 더해지는 추가 확률. */
    fastAggrBonus: 0.35,
    /** 균형 위험(inDanger) 중이면 무조건 CAREFUL. */
    carefulWhenDanger: true,
  },

  /**
   * FAST 질주는 "버스트" 패턴(사람의 치고-멈추기 흉내):
   * hold 동안 전진 → rest 동안 릴리즈(감속 1s 포함 여유). TELL이 안 떠도 스스로 멈춰
   * 불시의 TELL(0.8s)에도 살아남을 기회를 만든다. FAST의 리스크는 남는다(rest 전 TELL).
   */
  fastBurst: {
    hold: { min: 1.0, max: 2.0 },
    rest: { min: 1.0, max: 1.6 },
    /**
     * 예측 정지: GREEN이 이 시간(초)을 넘기면 "곧 레드다" 직감으로 질주 중단.
     * GREEN은 2~5s → 3초쯤부터 몸을 사리는 사람 심리 모사. 봇마다 [min,max] 샘플.
     */
    anticipateAfter: { min: 1.8, max: 3.0 },
  },

  /** 균형(A/D) 보정 로직. */
  balance: {
    /** GREEN/TELL: |tilt|가 이 값을 넘으면 보정 시작. */
    correctThreshold: 0.38,
    /** 보정 종료(이 아래로 내려오면 입력 해제. 과보정 방지 히스테리시스). */
    releaseThreshold: 0.14,
    /**
     * RED: |tilt|가 (tiltDropThreshold × 이 비율)을 넘으면 "보정 vs 흘림" 결정 시점.
     * 보정하면 경고 +1, 안 하면 짐 낙하.
     */
    redDecideFrac: 0.82,
    /** RED 보정 종료 비율(tiltDropThreshold 대비). */
    redReleaseFrac: 0.5,
    /**
     * RED에서 보정(경고 감수)을 선택할 확률 = protectBase + 짐개수×protectPerCargo.
     * 짐이 많을수록 지키려는 경향. 단 경고가 warningMax-1이면 절대 보정 안 함(탈락 방지).
     */
    protectBase: 0.35,
    protectPerCargo: 0.08,
  },

  /** 좌우 배회(넓어진 길 활용): GREEN 중 목표 x를 주기적으로 재선정해 이동. */
  wander: {
    enabled: true,
    /** 목표 x 재선정 주기(초) [min,max]. */
    interval: { min: 2.0, max: 5.0 },
    /** 레인 반폭 대비 배회 폭 비율(가장자리 여유). */
    laneFrac: 0.85,
    /** 목표 x에 이 이상 가까우면 배회 입력 해제. */
    arriveEps: 0.35,
    /** 배회 좌우 입력 세기(-1~1). 균형 보정이 항상 우선. */
    strength: 0.55,
  },
} as const;

export type BotConfigType = typeof BotConfig;
