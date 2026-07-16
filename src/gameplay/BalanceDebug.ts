/**
 * BalanceDebug.ts
 * 점수 공식의 단일 소스 + 밸런스 정합성 시뮬레이션.
 * 모든 수치는 GameBalance/ItemConfig에서 읽는다(하드코딩 금지).
 *
 * 공식:
 *   무버 점수  = 반입 짐 × cargoPoint + 생존보너스(K / 생존자수)
 *   술래 점수  = 낙하 짐 × dropPointScale + 잡기보너스(c(c+1)/2 × catchBonusScale)
 *
 * 북극성: 기대 술래 점수 ≈ 기대 1등 무버 점수.
 */

import { GameBalance } from "../config/GameBalance";
import { PlayerConfig } from "../config/PlayerConfig";

/**
 * 술래 점수: (낙하 누적 + 잡기 가속 보너스) × 인원수 보정.
 * @param moverCount 라운드 참가 무버 수(술래 제외). 인원수 보정(seekerCountNorm)에 사용.
 */
export function seekerScoreOf(
  drops: number,
  catches: number,
  moverCount: number,
): number {
  const n = GameBalance.score.seekerCountNorm;
  const norm = Math.pow(n.ref / Math.max(1, moverCount), n.power);
  return (
    (drops * GameBalance.score.dropPointScale + catchBonusOf(catches)) * norm
  );
}

/** 무버 점수: 반입 짐 + 생존 희소성 보너스(K / 생존자수). */
export function moverScoreOf(delivered: number, survivorCount: number): number {
  const survivors = Math.max(1, survivorCount);
  return (
    delivered * GameBalance.score.cargoPoint +
    GameBalance.score.survivorBonusK / survivors
  );
}

/**
 * 잡기 보너스만 따로(정산/표시용).
 * Phase 10: 기본 "linear"(잡기 1명당 catchBonusScale점).
 * "accelerating"이면 구식 가속형(c번째 잡기 c점, 누적 c(c+1)/2).
 */
export function catchBonusOf(catches: number): number {
  const s = GameBalance.score;
  if (s.catchBonusMode === "linear") {
    return catches * s.catchBonusScale;
  }
  return ((catches * (catches + 1)) / 2) * s.catchBonusScale;
}

export interface BalanceScenario {
  /** 무버 수(술래 제외) */
  moverCount: number;
  /** 술래가 잡은 인원 수 */
  seekerCatches: number;
  /** 술래가 수확한 낙하 짐 수 */
  seekerDrops: number;
  /** 1등 무버의 반입 짐 수 */
  topMoverDelivered: number;
}

/**
 * 정합성 자체 체크: 프롬프트의 8인 시나리오를 현재 Config로 시뮬레이션해 콘솔 출력.
 * 원본 예시(튜닝 전)는 술래 16 / 1등무버 11 이었고,
 * Phase 7 튜닝(K 28, dropPointScale 0.6) 후 북극성(술래 ≈ 1등무버)에 맞춰 ≈ 12 / 12로 수렴.
 * K / dropPointScale / catchBonusScale를 바꾸면 이 함수 출력이 즉시 반영됨(짐상한 5는 확정 규칙).
 */
export function simulateReference(
  scenario?: Partial<BalanceScenario>,
): { seeker: number; topMover: number; survivors: number } {
  const sc: BalanceScenario = {
    moverCount: 7, // 8인 = 무버 7 + 술래 1
    seekerCatches: 3,
    seekerDrops: 10,
    topMoverDelivered: PlayerConfig.startingCargo, // 짐 상한(=무버 점수 상한)
    ...scenario,
  };

  const survivors = sc.moverCount - sc.seekerCatches; // 잡히지 않은 무버 수
  const seeker = seekerScoreOf(sc.seekerDrops, sc.seekerCatches, sc.moverCount);
  const topMover = moverScoreOf(sc.topMoverDelivered, survivors);

  console.log("=== [BALANCE CHECK] 8인 기준 정합성 시뮬 ===");
  console.log(
    `  무버 ${sc.moverCount} + 술래 1 | 잡기 ${sc.seekerCatches}, 낙하수확 ${sc.seekerDrops}, 생존자 ${survivors}`,
  );
  console.log(
    `  술래 = 낙하 ${sc.seekerDrops}×${GameBalance.score.dropPointScale}` +
      ` + 잡기보너스(${sc.seekerCatches}→${catchBonusOf(sc.seekerCatches)}) = ${seeker.toFixed(1)}점`,
  );
  console.log(
    `  1등무버 = 반입 ${sc.topMoverDelivered}×${GameBalance.score.cargoPoint}` +
      ` + 생존보너스(K ${GameBalance.score.survivorBonusK}/${survivors}=${(GameBalance.score.survivorBonusK / survivors).toFixed(1)}) = ${topMover.toFixed(1)}점`,
  );
  console.log(
    `  북극성 격차: |술래 ${seeker.toFixed(1)} − 1등무버 ${topMover.toFixed(1)}| = ${Math.abs(seeker - topMover).toFixed(1)} (0에 가까울수록 균형)`,
  );

  return { seeker, topMover, survivors };
}
