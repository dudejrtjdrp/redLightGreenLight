/**
 * HomeScreen.ts
 * 게임 첫 진입 홈 화면(DOM 오버레이). 모드 선택 + 봇 인원수 지정.
 *
 *  - 봇 모드   : 나 + 봇 N명(1~BotConfig.maxBots, 기본 3). 90초 타이머 + 승패 결과.
 *  - 디버그 모드: 기존 싱글 플레이 + 좌상단 개발 HUD + 콘솔 밸런스 로그.
 *
 * 선택 즉시 onStart(options) 콜백 → main이 게임을 구성/시작.
 * DOM은 시작 시 제거(게임 중 오버레이 잔존 없음).
 */

import { BotConfig } from "../config/BotConfig";

export type GameMode = "bot" | "debug";

export interface GameOptions {
  mode: GameMode;
  /** 봇 모드에서만 사용(1 ~ BotConfig.maxBots). */
  botCount: number;
}

export class HomeScreen {
  private readonly root: HTMLDivElement;
  private botCount = 3;
  private readonly countLabel: HTMLSpanElement;

  constructor(private readonly onStart: (opts: GameOptions) => void) {
    this.root = document.createElement("div");
    this.root.style.cssText =
      "position:fixed;inset:0;z-index:100;display:flex;align-items:center;justify-content:center;" +
      "background:linear-gradient(160deg,#0e2a1f 0%,#123a2a 45%,#0b1f2e 100%);" +
      "font-family:'Segoe UI',Pretendard,system-ui,sans-serif;color:#eaf6ee;";

    const card = document.createElement("div");
    card.style.cssText =
      "width:min(460px,90vw);background:rgba(10,18,14,.82);border:1px solid #2e5c44;" +
      "border-radius:18px;padding:34px 38px;box-shadow:0 18px 60px rgba(0,0,0,.45);text-align:center;";

    card.innerHTML = `
      <div style="font-size:15px;letter-spacing:.35em;color:#7fd9a4;margin-bottom:6px;">MUGUNGHWA BALANCE</div>
      <h1 style="margin:0 0 4px;font-size:32px;font-weight:800;">무궁화 밸런스 게임</h1>
      <p style="margin:0 0 26px;font-size:13px;color:#a9c8b4;line-height:1.6;">
        무궁화꽃이 피었습니다 × 불안정한 짐 운반<br/>
        제한시간 <b style="color:#ffd66e;">1분 30초</b> — 술래보다 높은 점수로 완주하세요!
      </p>

      <div id="home-bot-row" style="display:flex;align-items:center;justify-content:center;gap:14px;margin-bottom:14px;">
        <span style="font-size:14px;color:#cfe8d8;">봇 인원</span>
        <button id="home-minus" style="${HomeScreen.stepBtn}">−</button>
        <span id="home-count" style="font-size:22px;font-weight:800;min-width:34px;color:#ffd66e;">3</span>
        <button id="home-plus" style="${HomeScreen.stepBtn}">+</button>
        <span style="font-size:12px;color:#7fa78d;">(최대 ${BotConfig.maxBots}명)</span>
      </div>

      <button id="home-bot" style="${HomeScreen.mainBtn("#2fbf71", "#123c26")}">🤖 봇 모드 시작</button>
      <button id="home-debug" style="${HomeScreen.mainBtn("#3d8bd4", "#102a42")}">🛠 디버그 모드</button>

      <div style="margin-top:22px;font-size:12px;color:#8fb89a;line-height:1.7;border-top:1px solid #24513a;padding-top:14px;">
        [조작] 전진 <b>W / Space / ↑</b> · 균형 <b>A · D (← →)</b> · 속도 모드 <b>Shift / E</b><br/>
        레드라이트에 움직이면 탈락! 짐을 흘리면 술래가 점수를 가져갑니다.
      </div>
    `;

    this.root.appendChild(card);
    document.body.appendChild(this.root);

    this.countLabel = card.querySelector("#home-count") as HTMLSpanElement;
    (card.querySelector("#home-minus") as HTMLButtonElement).onclick = () =>
      this.setCount(this.botCount - 1);
    (card.querySelector("#home-plus") as HTMLButtonElement).onclick = () =>
      this.setCount(this.botCount + 1);
    (card.querySelector("#home-bot") as HTMLButtonElement).onclick = () =>
      this.start({ mode: "bot", botCount: this.botCount });
    (card.querySelector("#home-debug") as HTMLButtonElement).onclick = () =>
      this.start({ mode: "debug", botCount: 0 });
  }

  private setCount(n: number): void {
    this.botCount = Math.max(1, Math.min(BotConfig.maxBots, n));
    this.countLabel.textContent = String(this.botCount);
  }

  private start(opts: GameOptions): void {
    this.root.remove();
    this.onStart(opts);
  }

  private static readonly stepBtn =
    "width:38px;height:38px;border-radius:10px;border:1px solid #3a6b4f;background:#163525;" +
    "color:#eaf6ee;font-size:20px;font-weight:700;cursor:pointer;";

  private static mainBtn(bg: string, fg: string): string {
    return (
      `display:block;width:100%;margin:10px 0 0;padding:15px 0;border-radius:12px;border:none;` +
      `background:${bg};color:${fg};font-size:17px;font-weight:800;cursor:pointer;` +
      `box-shadow:0 6px 18px rgba(0,0,0,.35);`
    );
  }
}
