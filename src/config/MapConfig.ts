/**
 * MapConfig.ts
 * 맵(도로) 시각 에셋 경로/정렬 상수. 논리 트랙(GameBalance.track)은 불변 — 맵을 트랙에 "맞춘다".
 *
 * ⚠ 경로: KayKit "Modular Roads" 킷. 단일 맵이 아니라 조각(타일) → 직선 도로 타일을 트랙 따라 타일링.
 *   폴더명에 공백/대괄호가 있어 로더에서 encodeURI 처리. 로드 실패 시 기존 바닥 폴백.
 *   서빙: vite publicDir="src/public" → src/public/assets/Map/... == "/assets/Map/...".
 */

export const MapConfig = {
  /** false면 맵 로드 건너뛰고 바닥 플레이스홀더 유지. */
  enabled: true,

  /** 직선 도로 타일(트랙을 따라 반복 배치). */
  roadTile: "/assets/Map/[FREE] Modular Roads - Base/PLUS/gltf/Road1.glb",

  /** 타일 스케일(도로 폭이 논리 레인 폭 ±laneHalfWidth 을 덮도록 조정). */
  scale: 1.6,
  /**
   * 각 도로 타일 회전(라디안). 도로가 트랙(세로, -z)을 따라 깔리게.
   * 가로로 깔리면 여기에 Math.PI/2 를 넣어 90° 돌리면 됨(정사각 타일 자동판별 대신 명시).
   */
  tileYaw: 0,
  /** 그룹 전체 추가 yaw(미세조정용). */
  yawOffset: 0,
  /** 도로 표면 높이(캐릭터 발 y=0에 맞춤). 도로가 뜨거나 잠기면 여기서 보정. */
  groundY: 0.0,
  /** x 중앙(레인 중심) 정렬. */
  centerX: 0,

  /** 출발선 뒤 / 도착선 앞 여유 타일 수(트랙 밖도 도로가 이어지게). */
  padStartTiles: 2,
  padEndTiles: 2,

  /** 로드 후 기존 그리드 헬퍼 숨김(도로 위 격자 제거). */
  hideGrid: true,

  /**
   * 도로 양옆 장식(가로등/나무/덤불). 한 번 로드 후 클론.
   * 도로 폭 밖(도로 절반폭 + edgeMargin 이후)에만 seeded random으로 흩뿌림 → 도로 안에는 절대 X.
   */
  decor: {
    enabled: true,
    props: [
      "/assets/Map/[FREE] Modular Roads - Base/PLUS/gltf/lamp_1.glb",
      "/assets/Map/[FREE] Modular Roads - Base/PLUS/gltf/tree_1_a.glb",
      "/assets/Map/[FREE] Modular Roads - Base/PLUS/gltf/bush_1.glb",
      "/assets/Map/[FREE] Modular Roads - Base/PLUS/gltf/Tree3.glb",
      "/assets/Map/[FREE] Modular Roads - Base/PLUS/gltf/Tree4.glb",
    ],
    /** 총 배치 개수(양옆 합). */
    count: 60,
    /** 도로 가장자리에서 최소 여유(이 안쪽엔 배치 X). */
    edgeMargin: 1.6,
    /** 도로 밖 x 랜덤 폭(edge ~ edge+spreadX). */
    spreadX: 7.0,
    /** 스케일 랜덤(base ± jitter). */
    scale: 1.0,
    scaleJitter: 0.35,
    /** 재현 가능한 배치 시드. */
    seed: 1337,
  },
} as const;
