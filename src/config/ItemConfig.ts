/**
 * ItemConfig.ts
 * 짐(cargo) 관련 수치. 짐 = 점수 = 유한 자원.
 */

export const ItemConfig = {
  /** 1인당 짐 상한 (유한, 리필 없음) */
  maxPerPlayer: 5,

  /** 짐 1개당 점수 */
  pointPerItem: 1,

  /** 낙하한 짐이 트랙에 남는지 여부 (뒤 무버가 회수 가능) */
  droppedRemainsOnTrack: true,

  /** 짐 시각 크기 (렌더용) */
  visualSize: 0.22,

  /** 짐이 쌓일 때 세로 간격 (등에 쌓는 스택 시각화용) */
  stackGap: 0.24,
} as const;

export type ItemConfigType = typeof ItemConfig;
