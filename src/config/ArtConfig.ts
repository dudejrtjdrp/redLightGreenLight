/**
 * ArtConfig.ts
 * 아트/연출 전용 상수(색-상태 매핑 + 주스). 게임 규칙/밸런스 수치 아님.
 * "아트가 곧 가독성" — 페이즈를 색으로 즉시 읽히게 하는 매핑을 여기 모은다.
 */

export const ArtConfig = {
  /** 카멜레온 색-상태 매핑 및 눈 연출. */
  chameleon: {
    bodyGreen: 0x6fcf4f,
    bodyRed: 0xe8412f,
    bodyCaught: 0xc0271b,
    emissiveGreen: 0x18400d,
    emissiveRed: 0x5c1109,
    emissiveCaught: 0x741107,
    eye: 0xfdfdfd,
    pupil: 0x1a1a1a,
    tail: 0x57b83f,
    leg: 0x4f9e3a,
    /** 초당 색 보간 속도(TELL 0.8~1.2s 안에 초록→빨강이 읽히도록). */
    colorLerpSpeed: 2.4,
    /** 눈 크기: 평상 vs 경계(RED/탈락). */
    eyeScaleCalm: 1.0,
    eyeScaleAlert: 1.4,
    /** 탈락 시 눈 뱅글 회전 속도(rad/s). */
    eyeSpinSpeed: 16,
  },

  /** 짐 스택이 높을수록 추가되는 흔들림(위태로움 표현). 칸당 가산 기울기. */
  stackShakePerBox: 0.06,

  /** 낙하 시 카멜레온 움찔(스쿼시). */
  flinch: {
    dropImpulse: 1.0,
    decayPerSec: 6.0,
    scale: 0.14,
  },

  /** 스크린셰이크(카메라 흔들림). 낙하/탈락 시. */
  screenShake: {
    dropEnergy: 0.35,
    caughtEnergy: 0.6,
    decayPerSec: 3.2,
    maxOffset: 0.45,
    freq: 38,
  },

  /** 씬/라이팅/포스트(가볍게). */
  scene: {
    /** 밝고 산뜻한 파티 톤 하늘. */
    background: 0x9ec9e8,
    fogNear: 22,
    fogFar: 58,
    exposure: 1.12,
    /** 소프트 그림자 1개. 프레임 드랍 시 false로 끄면 됨(동작 > 화려함). */
    shadows: true,
    shadowMapSize: 1024,
  },
} as const;
