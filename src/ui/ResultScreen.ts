/**
 * ResultScreen.ts
 * 라운드 종료 결과 화면(DOM 오버레이).
 * 승패 판정: 술래 최종 점수 vs 1등 무버 점수 (북극성 경쟁 구도 그대로).
 *  - 술래 > 1등 무버 → 술래 승리
 *  - 1등 무버 > 술래 → 플레이어(무버) 승리
 *  - 동점 → 무승부
 * 최종 리더보드 + [다시 하기(같은 설정)] / [홈으로].
 */

import { Mover, MoverStatus } from "../gameplay/Mover";
import { Seeker } from "../gameplay/Seeker";
import { ScoreSystem } from "../gameplay/ScoreSystem";
import { GameOptions } from "./HomeScreen";

/** 다시 하기(같은 설정) 전달용 sessionStorage 키. */
export const AUTO_START_KEY = "mugunghwa.autostart";

export interface ResultRefs {
  movers: readonly Mover[];
  seeker: Seeker;
  scoreSystem: ScoreSystem;
  /** 사람 플레이어 무버 id (표시 강조용). */
  playerId: number;
  /** 현재 게임 설정(다시 하기용). */
  options: GameOptions;
}

export class ResultScreen {
  private readonly root: HTMLDivElement;

  constructor(refs: ResultRefs) {
    const { movers, seeker, scoreSystem, playerId, options } = refs;

    const rows = movers
      .map((m) => ({
        id: m.id,
        name: m.id === playerId ? "나" : `봇${m.id - 1}`,
        score: scoreSystem.moverScore(m),
        status:
          m.status === MoverStatus.FINISHED
            ? "완주"
            : m.status === MoverStatus.CAUGHT
              ? "탈락"
              : "생존",
        isPlayer: m.id === playerId,
        isSeeker: false,
      }))
      .sort((a, b) => b.score - a.score);

    const seekerScore = scoreSystem.seekerScore();
    const topMover = rows.length > 0 ? rows[0].score : 0;

    const EPS = 1e-6;
    let title: string;
    let color: string;
    if (seekerScore > topMover + EPS) {
      title = "👹 술래 승리!";
      color = "#ff6b57";
    } else if (topMover > seekerScore + EPS) {
      title = "🎉 플레이어 승리!";
      color = "#4fe08a";
    } else {
      title = "🤝 무승부";
      color = "#ffd66e";
    }

    // 통합 순위(술래 포함).
    const board = [
      ...rows,
      {
        id: seeker.id,
        name: "술래",
        score: seekerScore,
        status: `잡기${seeker.catches}·수확${seeker.droppedCargoClaimed}`,
        isPlayer: false,
        isSeeker: true,
      },
    ].sort((a, b) => b.score - a.score);

    this.root = document.createElement("div");
    this.root.style.cssText =
      "position:fixed;inset:0;z-index:100;display:flex;align-items:center;justify-content:center;" +
      "background:rgba(6,12,9,.78);backdrop-filter:blur(4px);" +
      "font-family:'Segoe UI',Pretendard,system-ui,sans-serif;color:#eaf6ee;";

    const boardHtml = board
      .map((r, i) => {
        const hl = r.isSeeker
          ? "color:#ff9d8a;"
          : r.isPlayer
            ? "color:#ffd66e;font-weight:800;"
            : "";
        return (
          `<tr style="${hl}">` +
          `<td style="padding:4px 10px;text-align:center;">${i + 1}</td>` +
          `<td style="padding:4px 10px;">${r.name}</td>` +
          `<td style="padding:4px 10px;text-align:right;">${r.score.toFixed(1)}점</td>` +
          `<td style="padding:4px 10px;font-size:12px;color:#a9c8b4;">${r.status}</td>` +
          `</tr>`
        );
      })
      .join("");

    const card = document.createElement("div");
    card.style.cssText =
      "width:min(440px,92vw);background:rgba(12,20,15,.94);border:1px solid #2e5c44;" +
      "border-radius:18px;padding:30px 34px;text-align:center;box-shadow:0 18px 60px rgba(0,0,0,.5);";
    card.innerHTML = `
      <h1 style="margin:0 0 4px;font-size:34px;color:${color};">${title}</h1>
      <p style="margin:0 0 18px;font-size:13px;color:#a9c8b4;">
        술래 ${seekerScore.toFixed(1)}점 vs 1등 무버 ${topMover.toFixed(1)}점
      </p>
      <table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:22px;">
        <thead>
          <tr style="color:#7fa78d;font-size:12px;border-bottom:1px solid #24513a;">
            <th style="padding:4px 10px;">순위</th><th style="padding:4px 10px;text-align:left;">이름</th>
            <th style="padding:4px 10px;text-align:right;">점수</th><th style="padding:4px 10px;">상태</th>
          </tr>
        </thead>
        <tbody>${boardHtml}</tbody>
      </table>
      <div style="display:flex;gap:10px;">
        <button id="res-retry" style="${ResultScreen.btn("#2fbf71", "#123c26")}">다시 하기</button>
        <button id="res-home" style="${ResultScreen.btn("#31536e", "#dceaf5")}">홈으로</button>
      </div>
    `;

    this.root.appendChild(card);
    document.body.appendChild(this.root);

    (card.querySelector("#res-retry") as HTMLButtonElement).onclick = () => {
      sessionStorage.setItem(AUTO_START_KEY, JSON.stringify(options));
      location.reload();
    };
    (card.querySelector("#res-home") as HTMLButtonElement).onclick = () => {
      sessionStorage.removeItem(AUTO_START_KEY);
      location.reload();
    };
  }

  private static btn(bg: string, fg: string): string {
    return (
      `flex:1;padding:13px 0;border-radius:12px;border:none;background:${bg};color:${fg};` +
      `font-size:16px;font-weight:800;cursor:pointer;box-shadow:0 6px 18px rgba(0,0,0,.35);`
    );
  }
}
