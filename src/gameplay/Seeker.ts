/**
 * Seeker.ts
 * 술래(레드라이트 판정 주체) 엔티티의 "데이터"만 정의.
 * v1 싱글: 술래는 AI/타이머(상태머신)로 대체되지만, 점수 경쟁 주체로서 데이터는 가진다.
 * 비대칭 경쟁: 술래도 같은 리더보드에서 경쟁.
 */

export interface Seeker {
  readonly id: number;
  /** 누적 점수 (떨어뜨린 짐 + 잡은 인원 보너스). 정산은 이후 Phase. */
  score: number;
  /** 잡은 짐 누적 개수 (낙하 유발분) */
  droppedCargoClaimed: number;
  /** 잡은 무버 인원 수 (가속 보너스 계산용: c번째 = c점) */
  catches: number;
}

export function createSeeker(id: number): Seeker {
  return {
    id,
    score: 0,
    droppedCargoClaimed: 0,
    catches: 0,
  };
}
