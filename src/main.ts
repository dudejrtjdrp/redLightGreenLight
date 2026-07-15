/**
 * main.ts
 * 진입점.
 * Phase 1: 씬 + 고정 timestep 루프 + 리사이즈 + 최소 HUD.
 * Phase 2: 라운드 상태머신 + 게임플레이 데이터 모델(무버/술래/짐).
 * Phase 3: 입력 + 무버 이동(fake physics) + 레드라이트 즉시 탈락 + 완주 판정.
 *          렌더는 아직 데이터 미반영(무버 큐브 위치는 Phase 4에서). 규칙 동작을 HUD/콘솔로 검증.
 */

import { GameLoop } from "./core/GameLoop";
import { gameBus } from "./core/EventBus";
import { SceneManager } from "./render/SceneManager";

import { RoundStateMachine } from "./gameplay/RoundStateMachine";
import { RoundPhase, RoundPhaseName } from "./gameplay/RoundState";
import { createMover, MoverStatus, SpeedMode } from "./gameplay/Mover";
import { createSeeker } from "./gameplay/Seeker";
import { ItemPool } from "./gameplay/Item";
import { vec2 } from "./gameplay/types";
import { InputController } from "./input/InputController";
import { PlayerSystem } from "./gameplay/PlayerSystem";
// emit 지점 헬퍼/EventMap 선언 병합 로드 보장.
import "./gameplay/GameplayEvents";

const container = document.getElementById("app");
const hud = document.getElementById("hud");
if (!container) throw new Error("#app container not found");

const scene = new SceneManager(container);

// --- 게임플레이 데이터 ---
const seeker = createSeeker(0);
const player = createMover(1, vec2(0, 0));
const itemPool = new ItemPool(player.cargo);
for (let i = 0; i < player.cargo; i++) itemPool.acquireOwned(player.id);

// --- 시스템 ---
const round = new RoundStateMachine();
const input = new InputController();
const playerSystem = new PlayerSystem(player, input, round);

// --- 이벤트 구독(로그) ---
gameBus.on("phase:change", ({ from, to }) => {
  console.log(`[round] ${from} → ${to} @ ${round.elapsedRound.toFixed(1)}s`);
});
gameBus.on("mover:caught", ({ moverId }) => {
  console.log(`[OUT] mover ${moverId} 레드 중 이동 → 탈락`);
});
gameBus.on("mover:finished", ({ moverId, cargoDelivered }) => {
  console.log(`[FINISH] mover ${moverId} 완주, 짐 ${cargoDelivered}개 반입`);
});

// --- HUD 계측 ---
let simSteps = 0;
let frames = 0;
let fps = 0;

const loop = new GameLoop(
  {
    update: (dt: number) => {
      simSteps++;
      // 순서 주의: 플레이어를 먼저 갱신해 이번 프레임 RED 활동을
      // 상태머신이 RED→RESOLVE로 넘어가기 전에 반영(빈 턴 반환 정확도).
      playerSystem.update(dt);
      round.update(dt);
      gameBus.emit("loop:update", { dt });
    },
    render: (alpha: number) => {
      frames++;
      scene.render(alpha);
    },
  },
  { fixedStep: 1 / 60, maxFrameTime: 0.25 },
);

if (hud) {
  let lastFrames = 0;
  setInterval(() => {
    fps = frames - lastFrames;
    lastFrames = frames;
    const mode = player.speedMode === SpeedMode.FAST ? "빠름(100%)" : "신중(50%)";
    const holding = input.isForward ? "전진" : "정지";
    const speed = Math.abs(player.velocity.z).toFixed(2);
    hud.textContent =
      `무궁화 밸런스 게임 — Phase 3 (Gameplay)\n` +
      `[조작] 전진: Space/W/↑ (hold)  |  모드토글: Shift/E\n` +
      `phase: ${RoundPhaseName[round.phase]} (${round.phase})\n` +
      `round: ${round.elapsedRound.toFixed(1)}s\n` +
      `mode: ${mode}  input: ${holding}  speed: ${speed}\n` +
      `progress: ${(playerSystem.progress * 100).toFixed(0)}%  status: ${player.status}\n` +
      `cargo: ${player.cargo} | items: ${itemPool.activeCount} | fps: ${fps}`;
  }, 250);
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
round.start();

// 개발 편의: 콘솔 접근 노출.
(window as unknown as { __game?: unknown }).__game = {
  loop,
  scene,
  gameBus,
  round,
  RoundPhase,
  MoverStatus,
  seeker,
  player,
  itemPool,
  input,
  playerSystem,
};
