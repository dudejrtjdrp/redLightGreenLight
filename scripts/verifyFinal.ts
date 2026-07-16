/** 최종 검증: 실제 ScoreSystem 정산 경로로 봇전 승률 측정. */
import { RoundStateMachine } from "../src/gameplay/RoundStateMachine";
import { RoundPhase } from "../src/gameplay/RoundState";
import { createMover, Mover, MoverStatus } from "../src/gameplay/Mover";
import { createSeeker } from "../src/gameplay/Seeker";
import { vec2 } from "../src/gameplay/types";
import { PlayerSystem } from "../src/gameplay/PlayerSystem";
import { BotController } from "../src/gameplay/BotController";
import { CargoSystem } from "../src/gameplay/CargoSystem";
import { ScoreSystem } from "../src/gameplay/ScoreSystem";
import { CaughtMarchSystem } from "../src/gameplay/CaughtMarchSystem";
import { GameBalance } from "../src/config/GameBalance";
import { PlayerConfig } from "../src/config/PlayerConfig";
import { gameBus } from "../src/core/EventBus";

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const realLog = console.log;
console.log = () => {};
console.assert = () => {};

for (const moverCount of [2, 3, 4, 5, 7]) {
  const rng = mulberry32(4242 + moverCount);
  Math.random = mulberry32(777 + moverCount);
  let seekerWins = 0, moverWins = 0, draws = 0, gapSum = 0, skSum = 0, topSum = 0;
  const ROUNDS = 600;
  for (let r = 0; r < ROUNDS; r++) {
    gameBus.clear();
    const seeker = createSeeker(0);
    const round = new RoundStateMachine(rng);
    const cargo = new CargoSystem(seeker, moverCount * PlayerConfig.startingCargo + 8);
    const half = GameBalance.track.laneHalfWidth;
    const movers: Mover[] = [];
    const bots: BotController[] = [];
    const systems: PlayerSystem[] = [];
    for (let i = 0; i < moverCount; i++) {
      const x = -half * 0.8 + (i / Math.max(1, moverCount - 1)) * half * 1.6;
      const m = createMover(i + 1, vec2(x, 0));
      movers.push(m);
      cargo.spawnInitial(m);
      const bot = new BotController(m, round, rng);
      bots.push(bot);
      systems.push(new PlayerSystem(m, bot, round, cargo));
    }
    const score = new ScoreSystem(seeker, movers);
    const march = new CaughtMarchSystem(movers, cargo, round);
    round.start();
    const dt = 1 / 60;
    let t = 0;
    const done = () => movers.every((m) => m.status !== MoverStatus.ALIVE);
    while (round.phase !== RoundPhase.END && t < 300) {
      for (const b of bots) b.update(dt);
      for (const s of systems) s.update(dt);
      march.update(dt);
      cargo.updateFlights(dt);
      cargo.updateRecovery(movers);
      round.update(dt);
      if (round.isActive && done()) round.forceEnd();
      t += dt;
    }
    score.settle(); // 타임업 미완주자 탈락 반영
    const sk = score.seekerScore();
    const top = Math.max(...movers.map((m) => score.moverScore(m)));
    if (sk > top + 1e-9) seekerWins++;
    else if (top > sk + 1e-9) moverWins++;
    else draws++;
    gapSum += Math.abs(sk - top);
    skSum += sk; topSum += top;
    score.dispose();
  }
  realLog(
    `movers=${moverCount}: 술래승률=${((seekerWins / ROUNDS) * 100).toFixed(1)}% ` +
    `플레이어승률=${((moverWins / ROUNDS) * 100).toFixed(1)}% 무승부=${draws} ` +
    `평균격차=${(gapSum / ROUNDS).toFixed(1)} 술래=${(skSum / ROUNDS).toFixed(1)} 1등=${(topSum / ROUNDS).toFixed(1)}`,
  );
}
