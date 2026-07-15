/**
 * main.ts
 * 진입점.
 * Phase 1: 씬 + 고정 timestep 루프 + 리사이즈 + 최소 HUD.
 * Phase 2: 라운드 상태머신 구동 + 게임플레이 데이터 모델(무버/술래/짐) 배선 검증.
 *          렌더/입력/판정 로직은 아직 없음(Phase 3+). 여기서는 "상태머신이 돈다"를 증명한다.
 */

import { GameLoop } from "./core/GameLoop";
import { gameBus } from "./core/EventBus";
import { SceneManager } from "./render/SceneManager";

import { RoundStateMachine } from "./gameplay/RoundStateMachine";
import { RoundPhase, RoundPhaseName } from "./gameplay/RoundState";
import { createMover } from "./gameplay/Mover";
import { createSeeker } from "./gameplay/Seeker";
import { ItemPool } from "./gameplay/Item";
import { vec2 } from "./gameplay/types";
// emit 지점 헬퍼는 아직 호출하지 않지만, EventMap 선언 병합이 확실히 로드되도록 side-effect import.
import "./gameplay/GameplayEvents";

const container = document.getElementById("app");
const hud = document.getElementById("hud");
if (!container) throw new Error("#app container not found");

const scene = new SceneManager(container);

// --- Phase 2 게임플레이 데이터 (렌더 없음, 데이터 모델 배선 검증용) ---
const seeker = createSeeker(0);
const player = createMover(1, vec2(0, 0));
const itemPool = new ItemPool(player.cargo);
// 시작 짐 5개를 풀에서 대여해 플레이어 소유로 부여(생성/파괴 없이 재사용).
for (let i = 0; i < player.cargo; i++) itemPool.acquireOwned(player.id);

// --- 라운드 상태머신 ---
const round = new RoundStateMachine();

// phase:change 구독: 지금은 로그만(정산/판정은 이후 Phase의 emit 지점 헬퍼로 처리).
gameBus.on("phase:change", ({ from, to }) => {
  console.log(`[round] ${from} → ${to} @ ${round.elapsedRound.toFixed(1)}s`);
});

// --- HUD 계측 ---
let simSteps = 0;
let frames = 0;
let fps = 0;

const loop = new GameLoop(
  {
    update: (dt: number) => {
      simSteps++;
      round.update(dt); // 유일한 시뮬레이션 구동점. 불필요 tick 없음.
      gameBus.emit("loop:update", { dt });
    },
    render: (alpha: number) => {
      frames++;
      scene.render(alpha);
    },
  },
  { fixedStep: 1 / 60, maxFrameTime: 0.25 },
);

// HUD 갱신은 저빈도 타이머로(매프레임 DOM 갱신 회피).
if (hud) {
  let lastFrames = 0;
  setInterval(() => {
    fps = frames - lastFrames;
    lastFrames = frames;
    hud.textContent =
      `무궁화 밸런스 게임 — Phase 2 (Core System)\n` +
      `phase: ${RoundPhaseName[round.phase]} (${round.phase})\n` +
      `round: ${round.elapsedRound.toFixed(1)}s\n` +
      `mover cargo: ${player.cargo} | items active: ${itemPool.activeCount}\n` +
      `seeker score: ${seeker.score}\n` +
      `sim steps: ${simSteps} | fps: ${fps}`;
  }, 500);
}

window.addEventListener("resize", () => {
  scene.resize();
  gameBus.emit("view:resize", {
    width: window.innerWidth,
    height: window.innerHeight,
  });
});

gameBus.emit("loop:start", undefined);
loop.start();
round.start(); // LOBBY → GREEN 으로 진입시켜 페이즈 순환을 관찰 가능하게.

// 개발 편의: 콘솔 접근 노출.
(window as unknown as { __game?: unknown }).__game = {
  loop,
  scene,
  gameBus,
  round,
  RoundPhase,
  seeker,
  player,
  itemPool,
};
