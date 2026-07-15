/**
 * VisualConfig.ts
 * 캐릭터(흰색 휴머노이드) 룩 + 절차 워크 애니메이션 상수.
 * 상태 색은 "흰 몸 = 캔버스"에 틴트를 입히는 방식. 게임 밸런스 수치 아님.
 */

export const VisualConfig = {
  /** 상태별 온몸 틴트(흰 몸 + 색). color/emissive lerp로만 반영(매 프레임 new 금지). */
  humanoid: {
    bodyGreen: 0xd9f0d1, // 흰몸 + 초록 틴트
    bodyRed: 0xf3b1a4, // 흰몸 + 빨강 틴트
    bodyCaught: 0xdd5f52, // 탈락 경직(짙은 빨강)
    emissiveGreen: 0x14320e,
    emissiveRed: 0x5c1109,
    emissiveCaught: 0x741107,
    /** 초당 색 보간(TELL 0.8~1.2s 안에 초록→빨강 읽히게). */
    colorLerpSpeed: 2.4,
  },

  /** 절차 워크 사이클(단일 phase 스칼라, 이동거리 기반). */
  walk: {
    /** 한 걸음 사이클(2π) 진행에 필요한 이동거리(유닛). 작을수록 보폭 짧고 빠른 발걸음. */
    stride: 1.15,
    /** 다리 스윙 진폭(rad). */
    legSwing: 0.7,
    /** 무릎 굽힘 진폭(rad). */
    kneeBend: 0.5,
    /** 상하 바운스(유닛). */
    bounce: 0.06,
    /** 몸통 좌우 흔들림(rad). */
    sway: 0.05,
    /** 팔(캐리 포즈)의 미세 상하 흔들림(rad). */
    armBob: 0.05,
    /** 이 속도(유닛/초) 미만이면 idle로 간주. */
    moveEps: 0.2,
    /** 걷기↔idle 포즈 보간 속도(초당). */
    gaitLerp: 8,
    /** RED에서 정지 시 살짝 웅크리는 brace 하강(유닛). */
    braceCrouch: 0.05,
  },

  /** A/D 균형 → 몸통 좌우 무게중심 이동(tilt 소스). */
  balance: {
    leanScale: 0.22,
    maxLean: 0.5,
  },

  /** 아슬아슬(danger) 위험 연출: 맨 위 짐 wobble + 몸 붉은 강조. 낙하 X, 예고만. */
  danger: {
    /** 상위 짐 미세 진동 진폭(유닛). */
    wobbleAmp: 0.05,
    /** 진동 주파수. */
    wobbleFreq: 24,
    /** 몸 붉은 강조(emissive.r 가산 최대치). */
    emissivePulse: 0.45,
    /** 붉은 강조 깜빡임 주파수. */
    emissiveFreq: 9,
  },
} as const;
