/**
 * AssetConfig.ts
 * KayKit glb 에셋 경로/튜닝 상수(하드코딩 금지 — 여기 한 곳에서만).
 *
 * ⚠ 경로 확인 필요:
 *   세션 도구 제약으로 실제 파일명을 나열하지 못해 KayKit 표준 구조로 기본값을 넣었다.
 *   실행 시 콘솔의 [KayKit] 로그(해석된 URL / 로드 성공·실패 / 클립 이름)를 보고
 *   아래 경로/클립명을 실제 값으로 맞추면 된다. (로드 실패 시 절차적 캐릭터로 자동 폴백)
 *
 * 서빙: vite publicDir="src/public" → src/public/assets/X.glb == 런타임 "/assets/X.glb".
 */

export const AssetConfig = {
  /** false면 glb 로드 자체를 건너뛰고 절차적 캐릭터 강제(디버그). */
  enabled: true,

  /**
   * 캐릭터 glb (Rig_Medium). player=무버, seeker=술래는 서로 다른 모델.
   * 실제 파일: src/public/assets/gltf/{Knight,Mage,Ranger,Rogue,Rogue_Hooded,Barbarian}.glb
   */
  player: {
    path: "/assets/gltf/Knight.glb",
    scale: 0.82, // 발밑 원점 기준. 짐이 잘 보이게 살짝 축소.
    yawOffset: 0, // 모델 정면이 -Z가 되도록 보정(모델 자체 수정 금지).
  },
  seeker: {
    path: "/assets/gltf/Barbarian.glb", // 무버와 다른 캐릭터
    scale: 0.9,
    yawOffset: 0,
  },

  /** 봇 모델(인덱스 순환 배정). 플레이어(Knight)/술래(Barbarian)와 겹치지 않게. */
  botModels: [
    "/assets/gltf/Mage.glb",
    "/assets/gltf/Ranger.glb",
    "/assets/gltf/Rogue.glb",
    "/assets/gltf/Rogue_Hooded.glb",
    "/assets/gltf/Mage.glb",
    "/assets/gltf/Ranger.glb",
  ],

  /** 캐릭터가 이동 방향을 바라보게(3인칭 게임식: 이동 헤딩 전체로 부드럽게 회전). */
  face: {
    turnSpeed: 8, // 목표 yaw로 보간 속도(초당). 낮을수록 부드럽고 천천히.
    moveEps: 0.02, // 이 이동량 미만이면 방향 유지(정지 시 마지막 방향).
    /** 모델 정면 보정(라디안). 여전히 반대로 보면 Math.PI 로. */
    modelYawOffset: 0,
  },
  /** 몸 tilt lean 시각 저역통과(덜덜 떨림 방지) 속도. */
  bodyLeanFollow: 6,

  /** 애니메이션 클립만 추출할 glb들(같은 Rig_Medium 스켈레톤). 실패해도 개별 무시. */
  animations: [
    "/assets/Rig_Medium/Rig_Medium_MovementBasic.glb",
    "/assets/Rig_Medium/Rig_Medium_General.glb",
  ],

  /** 클립 이름 후보(부분일치, 대소문자 무시). 첫 매칭 사용. */
  clips: {
    walk: ["Walk_A", "Walking_A", "Walk", "Walking", "walk", "Jog", "Run_A"],
    idle: ["Idle_A", "Idle", "idle", "IdleNormal", "Idle_Loop"],
  },

  /** 워크 애니 속도 = 이동속도 / refSpeed (시간 아님). */
  walk: {
    /** 이 전진속도(유닛/초)에서 timeScale 1. PlayerConfig.baseMoveSpeed 기준. */
    refSpeed: 3.5,
    timeScaleMin: 0.4,
    timeScaleMax: 2.2,
    /** 이 속도 미만이면 idle. */
    moveEps: 0.15,
    /** 클립 크로스페이드 시간(초). */
    crossfade: 0.2,
  },

  /**
   * tilt(쏠림) → 캐릭터 몸 표현. 발밑 피벗 회전(호/원) 금지.
   * 주된 표현 = 수평 이동(무게중심 이동), 회전은 소량만(허리 높이 축).
   */
  bodyLeanScale: 0.28, // tilt당 수평 오프셋(유닛). 스택 shear와 같은 방향으로 함께 이동.
  bodyLeanMax: 0.55, // 수평 오프셋 상한
  bodyLeanRotate: 0.12, // tilt당 잔여 회전(rad, 소량)
  bodyLeanRotateMax: 0.3,
  bodyLeanPivotHeight: 0.9, // 잔여 회전의 축 높이(허리/가슴 → base가 호를 안 그리게)

  /** 짐 스택 부착: 손 본이 없으면 이 로컬 좌표(캐릭터 앞/가슴 높이)에 얹는다. */
  stackAnchor: { x: 0, y: 1.12, z: 0.28 },
  /** 손 본 이름 후보(부분일치). 찾으면 그 본에 스택 부착. */
  handBoneCandidates: [
    "handslot",
    "hand_r",
    "hand.r",
    "handr",
    "palm_r",
    "fist_r",
    "wrist_r",
  ],
} as const;
