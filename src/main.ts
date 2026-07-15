/**
 * main.ts
 * 진입점.
 * Phase 1: 씬 + 고정 timestep 루프 + 리사이즈 + 최소 HUD.
 * Phase 2: 라운드 상태머신 + 게임플레이 데이터 모델(무버/술래/짐).
 * Phase 3: 입력 + 무버 이동(fake physics) + 레드라이트 즉시 탈락 + 완주 판정.
 * Phase 4: 급정지 짐 낙하 + 트랙 잔류 + 회수 + 점수 귀속(자해 구조 검증).
 * Phase 5: 최종 점수 정산(반입 짐 + 생존보너스 / 낙하 + 잡기보너스) + 라운드 종료 + 정합성 시뮬.
 *          렌더 반영은 아직(무버/짐 시각화는 이후). 규칙 동작을 HUD/콘솔로 검증.
 */

import { GameLoop } from "./core/GameLoop";
import { gameBus } from "./core/EventBus";
import { SceneManager } from "./render/SceneManager";

import { RoundStateMachine } from "./gameplay/RoundStateMachine";
import { RoundPhase, RoundPhaseName } from "./gameplay/RoundState";
import { createMover, MoverStatus, SpeedMode } from "./gameplay/Mover";
import { createSeeker } from "./gameplay/Seeker";
import { vec2 } from "./gameplay/types";
import { InputController } from "./input/InputController";
import { PlayerSystem } from "./gameplay/PlayerSystem";
import { itemSpeedFactor } from "./gameplay/MovementSystem";
import { CargoSystem } from "./gameplay/CargoSystem";
import { ScoreSystem } from "./gameplay/ScoreSystem";
import { simulateReference } from "./gameplay/BalanceDebug";
import { GameRenderer } from "./render/GameRenderer";
import { UIOverlay } from "./ui/UIOverlay";
// emit 지점 헬퍼/EventMap 선언 병합 로드 보장.
import "./gameplay/GameplayEvents";

const container = document.getElementById("app");
const hud = document.getElementById("hud");
if (!container) throw new Error("#app container not found");

const scene = new SceneManager(container);

// --- 게임플레이 데이터 ---
const seeker = createSeeker(0);
const player = createMover(1, vec2(0, 0));

// --- 시스템 ---
const round = new RoundStateMachine();
const input = new InputController();
const cargo = new CargoSystem(seeker, player.cargo + 4);
cargo.spawnInitial(player); // 시작 짐 5개를 풀에서 대여해 소유로 부여
const playerSystem = new PlayerSystem(player, input, round, cargo);
const movers = [player] as const;
const scoreSystem = new ScoreSystem(seeker, movers);

// --- 렌더/UI 레이어 ---
const gameRenderer = new GameRenderer(scene, player, cargo);
const ui = new UIOverlay({ round, player, seeker, scoreSystem, movers });

// 시작 시 정합성 시뮬(8인 예시: 술래 ≈16 vs 1등무버 ≈11)을 콘솔에 1회 출력.
simulateReference();

// --- 이벤트 구독(로그) ---
gameBus.on("phase:change", ({ from, to }) => {
  console.log(`[round] ${from} → ${to} @ ${round.elapsedRound.toFixed(1)}s`);
  // 종료 진입 시 정산 1회.
  if (to === RoundPhase.END) scoreSystem.settle();
});
gameBus.on("mover:caught", ({ moverId }) => {
  console.log(`[OUT] mover ${moverId} 레드 중 이동 → 탈락`);
});
gameBus.on("mover:finished", ({ moverId, cargoDelivered }) => {
  console.log(`[FINISH] mover ${moverId} 완주, 짐 ${cargoDelivered}개 반입`);
});
// item:dropped 상세 로그는 CargoSystem이 자해 구조 검증과 함께 출력(중복 방지 위해 여기선 요약만).
gameBus.on("item:dropped", ({ itemId, byMoverId }) => {
  console.log(`[EVENT] item:dropped #${itemId} by mover ${byMoverId}`);
});

/** 전원 완주/탈락 여부(라운드 조기 종료 판정). */
function allMoversDone(): boolean {
  return movers.every(
    (m) =>
      m.status === MoverStatus.FINISHED || m.status === MoverStatus.CAUGHT,
  );
}

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
      cargo.updateRecovery(movers); // 반경 기반 회수(뒤 무버만)
      round.update(dt); // 시간 초과 시 여기서 END 전이

      // 전원 완주/탈락 시 즉시 종료(시간 초과 전이라도).
      if (round.isActive && allMoversDone()) round.forceEnd();

      // 시각 레이어 동기화(데이터 뒤따름). 카메라/이펙트 포함.
      gameRenderer.update(dt);

      gameBus.emit("loop:update", { dt });
    },
    render: (alpha: number) => {
      frames++;
      scene.render(alpha);
    },
  },
  { fixedStep: 1 / 60, maxFrameTime: 0.25 },
);

// 좌상단은 개발 디버그(성능/조작)만. 게임 상태는 우상단 UIOverlay가 담당.
if (hud) {
  let lastFrames = 0;
  setInterval(() => {
    fps = frames - lastFrames;
    lastFrames = frames;
    const mode = player.speedMode === SpeedMode.FAST ? "빠름(100%)" : "신중(50%)";
    const holding = input.isForward ? "전진" : "정지";
    const speed = Math.abs(player.velocity.z).toFixed(2);
    hud.textContent =
      `무궁화 밸런스 게임 — Phase 4rev (Balance Kick)\n` +
      `[조작] 전진 W/Space/↑ | 균형 A·D(←→) | 모드 Shift/E\n` +
      `phase: ${RoundPhaseName[round.phase]}  mode: ${mode}  ${holding}  v=${speed}\n` +
      `짐:${player.cargo} 속도배율:${itemSpeedFactor(player.cargo).toFixed(2)}x  tilt:${player.tilt.toFixed(2)} warn:${player.warnings}\n` +
      `sim: ${simSteps}  fps: ${fps}`;
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
  cargo,
  input,
  playerSystem,
  scoreSystem,
  gameRenderer,
  ui,
  simulateReference, // 콘솔에서 __game.simulateReference({seekerCatches:5}) 등으로 튜닝 실험
};
