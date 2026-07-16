/**
 * ScoreSystem.ts
 * 최종 점수 정산의 단일 소유자. 공식은 BalanceDebug(순수 함수) 재사용.
 *
 *  - 무버 점수 = 반입 짐 + 생존보너스(K/생존자수). 단, 탈락(CAUGHT) 무버는 0.
 *  - 술래 점수 = 낙하 누적(droppedCargoClaimed) + 잡기보너스(c(c+1)/2).
 *  - 술래 catches는 여기서 mover:caught 구독으로 단일 증가(다른 곳에서 증가 X).
 *
 * settle()은 라운드 END 시 1회 호출(정산 로그 + 정합성 체크).
 */

import { gameBus } from "../core/EventBus";
import { Mover, MoverStatus } from "./Mover";
import { Seeker } from "./Seeker";
import { moverScoreOf, catchBonusOf, seekerScoreOf } from "./BalanceDebug";
import { GameBalance } from "../config/GameBalance";
import { emitMoverCaught } from "./GameplayEvents";

export class ScoreSystem {
  private settled = false;

  constructor(
    private readonly seeker: Seeker,
    private readonly movers: readonly Mover[],
  ) {
    gameBus.on("mover:caught", this.onCaught);
  }

  /** 잡기 단일 소스: c번째 잡기 반영. */
  private readonly onCaught = (): void => {
    this.seeker.catches += 1;
  };

  /** 생존자 수 = 탈락(CAUGHT)하지 않은 무버(완주 + 생존). */
  survivorCount(): number {
    return this.movers.filter((m) => m.status !== MoverStatus.CAUGHT).length;
  }

  /** 무버 최종 점수. 탈락자는 0. */
  moverScore(m: Mover): number {
    if (m.status === MoverStatus.CAUGHT) return 0;
    const delivered = m.status === MoverStatus.FINISHED ? m.cargoDelivered : 0;
    return moverScoreOf(delivered, this.survivorCount());
  }

  /** 술래 최종(또는 라이브) 점수. 인원수 보정 포함. */
  seekerScore(): number {
    return seekerScoreOf(
      this.seeker.droppedCargoClaimed,
      this.seeker.catches,
      this.movers.length,
    );
  }

  /** 라운드 종료 정산(중복 방지). */
  settle(): void {
    if (this.settled) return;

    // ★ 원작 규칙(Phase 10): 시간 내 완주하지 못한 생존자는 그대로 탈락(잡힘) 처리.
    //   emitMoverCaught → onCaught로 술래 catches 증가 + 줄서기 연출(mover:caught 구독자).
    for (const m of this.movers) {
      if (m.status === MoverStatus.ALIVE) {
        console.log(`[TIMEOUT] mover ${m.id} 시간 내 미완주 → 탈락 처리`);
        emitMoverCaught(m);
      }
    }

    this.settled = true;

    const survivors = this.survivorCount();
    const rows = this.movers
      .map((m) => ({ id: m.id, status: m.status, score: this.moverScore(m) }))
      .sort((a, b) => b.score - a.score);

    const seekerFinal = this.seekerScore();
    const topMover = rows.length > 0 ? rows[0].score : 0;

    console.log("========== ROUND END: 최종 점수 ==========");
    console.log(`생존자 수: ${survivors}  (생존보너스 = K/${Math.max(1, survivors)})`);
    rows.forEach((r, i) => {
      console.log(`  ${i + 1}. 무버#${r.id} [${r.status}] ${r.score.toFixed(1)}점`);
    });
    console.log(
      `  술래#${this.seeker.id} ${seekerFinal.toFixed(1)}점` +
        ` (낙하수확 ${this.seeker.droppedCargoClaimed}×${GameBalance.score.dropPointScale}` +
        ` + 잡기보너스 ${catchBonusOf(this.seeker.catches)} [c=${this.seeker.catches}])`,
    );
    console.log(
      `[정합성] 술래 ${seekerFinal.toFixed(1)} vs 1등무버 ${topMover.toFixed(1)}` +
        ` → 격차 ${Math.abs(seekerFinal - topMover).toFixed(1)} (북극성: 근접할수록 균형)`,
    );
    console.log("==========================================");
  }

  get isSettled(): boolean {
    return this.settled;
  }

  dispose(): void {
    gameBus.off("mover:caught", this.onCaught);
  }
}
