/**
 * UIOverlay.ts
 * 경량 DOM 오버레이. 게임 상태를 저빈도(200ms)로 갱신 — 매 프레임 DOM 접근 없음.
 * 표시: 페이즈 배너(색+구호), 타이머, 내 짐, 술래 점수, 리더보드.
 * DOM 노드는 생성자에서 1회 생성, 이후 textContent/스타일만 변경(리플로우 최소).
 */

import { RoundStateMachine } from "../gameplay/RoundStateMachine";
import { RoundPhase } from "../gameplay/RoundState";
import { Mover, MoverStatus } from "../gameplay/Mover";
import { Seeker } from "../gameplay/Seeker";
import { ScoreSystem } from "../gameplay/ScoreSystem";
import { GameBalance } from "../config/GameBalance";
import { BalanceConfig } from "../config/BalanceConfig";

export interface UIRefs {
  round: RoundStateMachine;
  player: Mover;
  seeker: Seeker;
  scoreSystem: ScoreSystem;
  movers: readonly Mover[];
  /** 사람 플레이어 무버 id(리더보드 "나" 표시용). 미지정 시 player.id. */
  playerId?: number;
}

/** 페이즈별 색/구호. */
const PHASE_STYLE: Record<RoundPhase, { color: string; chant: string }> = {
  [RoundPhase.LOBBY]: { color: "#5a6472", chant: "대기 중" },
  [RoundPhase.GREEN]: { color: "#28c76f", chant: "무궁화 꽃이…" },
  [RoundPhase.TELL]: { color: "#f5a623", chant: "무궁화 꽃이 피었…" },
  [RoundPhase.RED]: { color: "#ea3d3d", chant: "피었습니다!" },
  [RoundPhase.RESOLVE]: { color: "#8a7fff", chant: "정산" },
  [RoundPhase.END]: { color: "#5a6472", chant: "라운드 종료" },
};

export class UIOverlay {
  private readonly root: HTMLDivElement;
  private readonly banner: HTMLDivElement;
  private readonly stats: HTMLPreElement;
  private readonly board: HTMLPreElement;
  /** 상단 중앙 카운트다운 타이머(1:30 → 0:00). */
  private readonly topTimer: HTMLDivElement;
  private readonly timerId: number;

  constructor(private readonly refs: UIRefs) {
    // 상단 중앙 타이머(별도 루트 — 게임 몰입 방해 최소화).
    this.topTimer = document.createElement("div");
    this.topTimer.style.cssText =
      "position:fixed;top:10px;left:50%;transform:translateX(-50%);z-index:10;" +
      "font:800 30px/1 ui-monospace,Menlo,Consolas,monospace;color:#eaf6ee;" +
      "background:rgba(10,14,20,.72);border:1px solid #2c3a52;border-radius:12px;" +
      "padding:10px 22px;pointer-events:none;user-select:none;" +
      "text-shadow:0 1px 3px rgba(0,0,0,.6);";
    document.body.appendChild(this.topTimer);
    this.root = document.createElement("div");
    this.root.style.cssText =
      "position:fixed;top:12px;right:12px;width:230px;" +
      "font:12px/1.5 ui-monospace,Menlo,Consolas,monospace;color:#e6edf3;" +
      "background:rgba(10,14,20,.72);border:1px solid #2c3a52;border-radius:10px;" +
      "padding:10px;pointer-events:none;user-select:none;z-index:10;";

    this.banner = document.createElement("div");
    this.banner.style.cssText =
      "font-size:15px;font-weight:700;text-align:center;padding:8px;" +
      "border-radius:8px;margin-bottom:8px;color:#0b0d12;";
    this.root.appendChild(this.banner);

    this.stats = document.createElement("pre");
    this.stats.style.cssText = "margin:0 0 8px;white-space:pre-wrap;";
    this.root.appendChild(this.stats);

    const boardTitle = document.createElement("div");
    boardTitle.textContent = "리더보드";
    boardTitle.style.cssText =
      "font-weight:700;border-top:1px solid #2c3a52;padding-top:6px;margin-bottom:2px;";
    this.root.appendChild(boardTitle);

    this.board = document.createElement("pre");
    this.board.style.cssText = "margin:0;white-space:pre-wrap;";
    this.root.appendChild(this.board);

    document.body.appendChild(this.root);

    this.timerId = window.setInterval(() => this.update(), 200);
    this.update();
  }

  private update(): void {
    const { round, player, seeker, scoreSystem, movers } = this.refs;
    const playerId = this.refs.playerId ?? player.id;

    // 상단 타이머: 남은 시간 m:ss. 10초 미만이면 빨강 강조.
    const remain = round.remaining;
    const mm = Math.floor(remain / 60);
    const ss = Math.floor(remain % 60);
    this.topTimer.textContent = `⏱ ${mm}:${String(ss).padStart(2, "0")}`;
    this.topTimer.style.color = remain <= 10 ? "#ff6b57" : "#eaf6ee";

    // 배너: 페이즈 색 + 구호.
    const style = PHASE_STYLE[round.phase];
    this.banner.style.background = style.color;
    this.banner.textContent = `${style.chant}  [${round.phase}]`;

    // 스탯.
    const tiltBar = this.tiltBar(player.tilt);
    this.stats.textContent =
      `내 짐: ${player.cargo}   진행: ${this.progressPct()}%\n` +
      `균형: ${tiltBar}${player.inDanger ? "  ⚠ 아슬아슬!" : ""}\n` +
      `경고: ${player.warnings} / ${BalanceConfig.warningMax}\n` +
      `내 상태: ${this.statusKo(player)}`;

    // 리더보드: 무버 + 술래 통합 정렬.
    const rows = movers.map((m) => ({
      name: m.id === playerId ? "나" : `봇${m.id - 1}`,
      score: scoreSystem.moverScore(m),
      tag: this.statusKo(m),
    }));
    rows.push({
      name: "술래",
      score: scoreSystem.seekerScore(),
      tag: `잡기${seeker.catches}·낙하${seeker.droppedCargoClaimed}`,
    });
    rows.sort((a, b) => b.score - a.score);

    this.board.textContent = rows
      .map((r, i) => `${i + 1}. ${r.name} ${r.score.toFixed(1)}  (${r.tag})`)
      .join("\n");
  }

  private progressPct(): number {
    const { player } = this.refs;
    const traveled = GameBalance.track.startZ - player.position.z;
    return Math.round(
      Math.min(1, Math.max(0, traveled / GameBalance.track.length)) * 100,
    );
  }

  /** tilt를 -threshold..+threshold 게이지로. 중앙(|)에 가까울수록 안정. */
  private tiltBar(tilt: number): string {
    const th = BalanceConfig.tiltDropThreshold;
    const n = 11;
    const mid = Math.floor(n / 2);
    const clamped = Math.max(-1, Math.min(1, tilt / th));
    const pos = Math.round(mid + clamped * mid);
    let s = "";
    for (let i = 0; i < n; i++) {
      s += i === pos ? "●" : i === mid ? "|" : "·";
    }
    return `[${s}]`;
  }

  private statusKo(m: Mover): string {
    switch (m.status) {
      case MoverStatus.CAUGHT:
        return "탈락";
      case MoverStatus.FINISHED:
        return "완주";
      default:
        return "생존";
    }
  }

  dispose(): void {
    window.clearInterval(this.timerId);
    this.root.remove();
    this.topTimer.remove();
  }
}
