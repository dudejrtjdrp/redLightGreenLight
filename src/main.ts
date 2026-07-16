/**
 * main.ts
 * 진입점.
 * Phase 1~8: 씬/루프 → 상태머신 → 이동/판정 → 짐 낙하/회수 → 정산 → 렌더/아트.
 * Phase 9 (홈/봇 모드):
 *  - 홈 화면: 봇 모드(봇 1~6명 지정) / 디버그 모드 선택.
 *  - 봇: BotController(MoverInput 구현)가 사람과 동일 규칙(PlayerSystem)으로 플레이.
 *  - 상단 타이머 90초(1분 30초) 고정 + 종료 시 술래/플레이어 승패 결과 화면.
 */

import { GameLoop } from "./core/GameLoop";
import { gameBus } from "./core/EventBus";
import { SceneManager } from "./render/SceneManager";

import { RoundStateMachine } from "./gameplay/RoundStateMachine";
import { RoundPhase, RoundPhaseName } from "./gameplay/RoundState";
import { createMover, MoverStatus, SpeedMode, Mover } from "./gameplay/Mover";
import { createSeeker } from "./gameplay/Seeker";
import { vec2 } from "./gameplay/types";
import { InputController } from "./input/InputController";
import { PlayerSystem } from "./gameplay/PlayerSystem";
import { BotController } from "./gameplay/BotController";
import { CaughtMarchSystem } from "./gameplay/CaughtMarchSystem";
import { itemSpeedFactor } from "./gameplay/MovementSystem";
import { CargoSystem } from "./gameplay/CargoSystem";
import { ScoreSystem } from "./gameplay/ScoreSystem";
import { simulateReference } from "./gameplay/BalanceDebug";
import { GameRenderer } from "./render/GameRenderer";
import { UIOverlay } from "./ui/UIOverlay";
import { HomeScreen, GameOptions } from "./ui/HomeScreen";
import { ResultScreen, AUTO_START_KEY } from "./ui/ResultScreen";
import { GameBalance } from "./config/GameBalance";
import { PlayerConfig } from "./config/PlayerConfig";
// emit 지점 헬퍼/EventMap 선언 병합 로드 보장.
import "./gameplay/GameplayEvents";

const container = document.getElementById("app");
const hud = document.getElementById("hud");
if (!container) throw new Error("#app container not found");

/** 홈 → 게임 시작. "다시 하기"는 sessionStorage 옵션으로 홈 생략. */
function boot(): void {
  const saved = sessionStorage.getItem(AUTO_START_KEY);
  if (saved) {
    sessionStorage.removeItem(AUTO_START_KEY);
    try {
      startGame(JSON.parse(saved) as GameOptions);
      return;
    } catch {
      /* 파손 시 홈으로 */
    }
  }
  new HomeScreen((opts) => startGame(opts));
}

function startGame(options: GameOptions): void {
  const isDebug = options.mode === "debug";
  const botCount = isDebug ? 0 : options.botCount;

  const scene = new SceneManager(container as HTMLElement);

  // --- 게임플레이 데이터 ---
  const seeker = createSeeker(0);
  const PLAYER_ID = 1;

  // 스폰: 넓어진 레인에 플레이어+봇을 균등 분산(플레이어는 중앙 근처 슬롯).
  const total = 1 + botCount;
  const half = GameBalance.track.laneHalfWidth;
  const slotX = (i: number): number =>
    total === 1 ? 0 : -half * 0.8 + (i / (total - 1)) * half * 1.6;
  const playerSlot = Math.floor(total / 2);

  const player = createMover(PLAYER_ID, vec2(slotX(playerSlot), 0));
  const movers: Mover[] = [player];
  for (let i = 0; i < botCount; i++) {
    const slot = i < playerSlot ? i : i + 1; // 플레이어 슬롯 비켜서
    movers.push(createMover(PLAYER_ID + 1 + i, vec2(slotX(slot), 0)));
  }

  // --- 시스템 ---
  const round = new RoundStateMachine();
  const input = new InputController();
  const cargo = new CargoSystem(
    seeker,
    total * PlayerConfig.startingCargo + 8,
  );
  for (const m of movers) cargo.spawnInitial(m);

  const bots: BotController[] = [];
  const systems: PlayerSystem[] = [];
  for (const m of movers) {
    if (m.id === PLAYER_ID) {
      systems.push(new PlayerSystem(m, input, round, cargo));
    } else {
      const bot = new BotController(m, round);
      bots.push(bot);
      systems.push(new PlayerSystem(m, bot, round, cargo));
    }
  }
  const scoreSystem = new ScoreSystem(seeker, movers);
  // 무궁화꽃 원작 연출: 잡힌 무버는 술래 왼쪽으로 걸어가 줄을 선다.
  const march = new CaughtMarchSystem(movers);

  // --- 렌더/UI 레이어 ---
  const gameRenderer = new GameRenderer(scene, movers, PLAYER_ID, cargo);
  const ui = new UIOverlay({
    round,
    player,
    seeker,
    scoreSystem,
    movers,
    playerId: PLAYER_ID,
  });

  // 디버그 모드: 시작 시 정합성 시뮬을 콘솔에 1회 출력.
  if (isDebug) simulateReference();

  // --- 이벤트 구독(로그 + 종료 처리) ---
  let resultShown = false;
  gameBus.on("phase:change", ({ from, to }) => {
    console.log(`[round] ${from} → ${to} @ ${round.elapsedRound.toFixed(1)}s`);
    if (to === RoundPhase.END) {
      scoreSystem.settle(); // 종료 진입 시 정산 1회.
      if (!resultShown) {
        resultShown = true;
        // 마지막 연출(탈락/완주)이 보이도록 잠깐 뒤 결과 표시.
        window.setTimeout(() => {
          new ResultScreen({
            movers,
            seeker,
            scoreSystem,
            playerId: PLAYER_ID,
            options,
          });
        }, 900);
      }
    }
  });
  gameBus.on("mover:caught", ({ moverId }) => {
    console.log(`[OUT] mover ${moverId} 레드 중 이동 → 탈락`);
  });
  gameBus.on("mover:finished", ({ moverId, cargoDelivered }) => {
    console.log(`[FINISH] mover ${moverId} 완주, 짐 ${cargoDelivered}개 반입`);
  });
  gameBus.on("item:dropped", ({ itemId, byMoverId }) => {
    console.log(`[EVENT] item:dropped #${itemId} by mover ${byMoverId}`);
  });

  /** 전원 완주/탈락 여부(라운드 조기 종료 판정). */
  const allMoversDone = (): boolean =>
    movers.every(
      (m) => m.status === MoverStatus.FINISHED || m.status === MoverStatus.CAUGHT,
    );

  // --- HUD 계측(디버그 모드 전용) ---
  let simSteps = 0;
  let frames = 0;
  let fps = 0;

  const loop = new GameLoop(
    {
      update: (dt: number) => {
        simSteps++;
        // 순서 주의: 봇 두뇌 → 무버 갱신 → 짐/라운드. 이번 프레임 RED 활동을
        // 상태머신이 RED→RESOLVE로 넘어가기 전에 반영(빈 턴 반환 정확도).
        for (const b of bots) b.update(dt);
        for (const s of systems) s.update(dt);
        march.update(dt); // 탈락자 줄서기(생존 로직과 무관, 연출 이동만)
        cargo.updateFlights(dt); // 비행 중 낙하 짐 착지 → 회수 가능 전환
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

  // 좌상단 개발 HUD는 디버그 모드에서만. 게임 상태는 우상단 UIOverlay가 담당.
  if (hud && isDebug) {
    let lastFrames = 0;
    setInterval(() => {
      fps = frames - lastFrames;
      lastFrames = frames;
      const mode = player.speedMode === SpeedMode.FAST ? "빠름(100%)" : "신중(50%)";
      const holding = input.isForward ? "전진" : "정지";
      const speed = Math.abs(player.velocity.z).toFixed(2);
      hud.textContent =
        `무궁화 밸런스 게임 — 디버그 모드\n` +
        `[조작] 전진 W/Space/↑ | 균형 A·D(←→) | 모드 Shift/E\n` +
        `phase: ${RoundPhaseName[round.phase]}  mode: ${mode}  ${holding}  v=${speed}\n` +
        `짐:${player.cargo} 속도배율:${itemSpeedFactor(player.cargo).toFixed(2)}x  tilt:${player.tilt.toFixed(2)} warn:${player.warnings}\n` +
        `sim: ${simSteps}  fps: ${fps}  봇: ${botCount}`;
    }, 250);
  } else if (hud) {
    hud.textContent = "";
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

  // 개발 편의: 콘솔 접근 노출(디버그 모드).
  if (isDebug) {
    (window as unknown as { __game?: unknown }).__game = {
      loop,
      scene,
      gameBus,
      round,
      RoundPhase,
      MoverStatus,
      seeker,
      player,
      movers,
      cargo,
      input,
      systems,
      scoreSystem,
      gameRenderer,
      ui,
      simulateReference, // __game.simulateReference({seekerCatches:5}) 등으로 튜닝 실험
    };
  }
}

boot();
// EOF
