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

  /** 타일 스케일(도로 폭이 논리 레인 폭을 덮도록 조정). */
  scale: 1.0,
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

  /** 도로 양옆 장식(가로등/나무/덤불 등). 한 번 로드 후 클론 배치. */
  decor: {
    enabled: true,
    props: [
      "/assets/Map/[FREE] Modular Roads - Base/PLUS/gltf/lamp_1.glb",
      "/assets/Map/[FREE] Modular Roads - Base/PLUS/gltf/tree_1_a.glb",
      "/assets/Map/[FREE] Modular Roads - Base/PLUS/gltf/bush_1.glb",
      "/assets/Map/[FREE] Modular Roads - Base/PLUS/gltf/Tree3.glb",
    ],
    /** z 방향 배치 간격(유닛). */
    spacing: 4.5,
    /** 도로 중심에서 좌우 배치 거리(레인 밖). */
    sideOffsetX: 4.4,
    /** 배경 깊이용 먼 나무열 좌우 거리(0이면 끔). */
    farOffsetX: 9.0,
    scale: 1.0,
  },
} as const;
