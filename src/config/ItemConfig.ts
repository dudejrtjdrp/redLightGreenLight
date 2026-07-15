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

  /** 회수 판정 반경(월드 유닛). 무버가 뒤에서 접근 시 이 반경 내 낙하물 자동 흡수. */
  recoverRadius: 0.9,

  /**
   * 짐 1개당 술래 "재수확" 상한(무한 faucet 방지 다이얼).
   * 낙하 → 회수 → 재낙하가 반복돼도 술래가 이 횟수까지만 가점.
   * 기본은 넉넉히(사실상 제한 거의 없음). 밸런싱 대상.
   */
  maxSeekerHarvestPerItem: 3,

  /** 짐 시각 크기 (렌더용) */
  visualSize: 0.22,

  /** 짐이 쌓일 때 세로 간격 (등에 쌓는 스택 시각화용) */
  stackGap: 0.24,
} as const;

export type ItemConfigType = typeof ItemConfig;
