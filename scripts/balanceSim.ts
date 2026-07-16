/**
 * balanceSim.ts — 점수제 밸런스 오프라인 시뮬레이션.
 *
 * 접근:
 *  1) 실제 게임 코드(상태머신/이동/균형/짐/봇AI)를 헤드리스로 구동해
 *     라운드 이벤트(잡기 c, 낙하수확 d, 생존자 s, 무버별 반입)를 수집한다.
 *     — 이 분포는 점수 노브와 무관(노브는 정산에만 관여).
 *  2) 수집된 라운드에 대해 점수 노브(K, dropScale, catchScale, 인원수보정 power,
 *     잡기 선형/가속) 그리드를 해석적으로 평가 → 술래 승률 ≈ 50% + 격차 최소 조합 탐색.
 *
 * Phase 10 채택값: K=10, dropScale=1.0, catchScale=1.8(선형), seekerCountNorm={ref:4, power:1}
 *
 * 실행:
 *   npx esbuild scripts/balanceSim.ts --bundle --platform=node --format=cjs --outfile=/tmp/sim.cjs
 *   node /tmp/sim.cjs
 */

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

// --- 시드 RNG (mulberry32) ---
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

// 콘솔 침묵(게임 코드의 로그 억제).
const realLog = console.log;
console.log = () => {};
console.assert = () => {};
console.warn = () => {};

interface RoundRecord {
  moverCount: number;
  catches: number;
  drops: number; // seeker.droppedCargoClaimed
  survivors: number;
  /** 무버별 [delivered, caught(0/1)] */
  movers: Array<[number, number]>;
}

function runRound(moverCount: number, rng: () => number): RoundRecord {
  gameBus.clear();
  const seeker = createSeeker(0);
  const round = new RoundStateMachine(rng);
  const cargo = new CargoSystem(seeker, moverCount * PlayerConfig.startingCargo + 8);

  const half = GameBalance.track.laneHalfWidth;
  const movers: Mover[] = [];
  const bots: BotController[] = [];
  const systems: PlayerSystem[] = [];
  for (let i = 0; i < moverCount; i++) {
    const x = moverCount === 1 ? 0 : -half * 0.8 + (i / (moverCount - 1)) * half * 1.6;
    const m = createMover(i + 1, vec2(x, 0));
    movers.push(m);
    cargo.spawnInitial(m);
    const bot = new BotController(m, round, rng);
    bots.push(bot);
    systems.push(new PlayerSystem(m, bot, round, cargo));
  }
  const score = new ScoreSystem(seeker, movers);
  const march = new CaughtMarchSystem(movers, cargo, round);

  const allDone = () =>
    movers.every((m) => m.status !== MoverStatus.ALIVE || m.status === undefined) ||
    movers.every(
      (m) => m.status === MoverStatus.FINISHED || m.status === MoverStatus.CAUGHT,
    );

  round.start();
  const dt = 1 / 60;
  let t = 0;
  while (round.phase !== RoundPhase.END && t < 300) {
    for (const b of bots) b.update(dt);
    for (const s of systems) s.update(dt);
    march.update(dt);
    cargo.updateFlights(dt);
    cargo.updateRecovery(movers);
    round.update(dt);
    if (round.isActive && allDone()) round.forceEnd();
    t += dt;
  }

  score.settle(); // 타임업 미완주자 탈락 처리 반영(원작 규칙)
  const rec: RoundRecord = {
    moverCount,
    catches: seeker.catches,
    drops: seeker.droppedCargoClaimed,
    survivors: score.survivorCount(),
    movers: movers.map((m) => [
      m.status === MoverStatus.FINISHED ? m.cargoDelivered : 0,
      m.status === MoverStatus.CAUGHT ? 1 : 0,
    ]),
  };
  score.dispose();
  gameBus.clear();
  return rec;
}

// --- 1단계: 라운드 수집 ---
const COUNTS = [2, 3, 4, 5, 7]; // 무버 수(나+봇1 ~ 나+봇6)
const ROUNDS = 800;
const records: RoundRecord[] = [];
const t0 = Date.now();
for (const c of COUNTS) {
  const rng = mulberry32(1000 + c);
  // 게임 코드 내부의 Math.random도 시드 고정(재현성).
  const globalRng = mulberry32(9000 + c);
  const origRandom = Math.random;
  Math.random = globalRng;
  for (let r = 0; r < ROUNDS; r++) records.push(runRound(c, rng));
  Math.random = origRandom;
}
realLog(`[collect] ${records.length} rounds in ${((Date.now() - t0) / 1000).toFixed(1)}s`);

// 수집 통계 요약.
for (const c of COUNTS) {
  const rs = records.filter((r) => r.moverCount === c);
  const avg = (f: (r: RoundRecord) => number) =>
    rs.reduce((s, r) => s + f(r), 0) / rs.length;
  realLog(
    `  movers=${c}: catches=${avg((r) => r.catches).toFixed(2)} drops=${avg((r) => r.drops).toFixed(2)} ` +
      `survivors=${avg((r) => r.survivors).toFixed(2)} finishers=${avg((r) => r.movers.filter((m) => m[0] > 0).length).toFixed(2)} ` +
      `topDelivered=${avg((r) => Math.max(...r.movers.map((m) => m[0]))).toFixed(2)}`,
  );
}

// --- 2단계: 노브 그리드 평가 ---
function evalKnobs(
  K: number,
  dropS: number,
  catchS: number,
  normP = 0,
  normRef = 4,
  catchLinear = false,
) {
  const perCount: Record<number, { wr: number; gap: number; seeker: number; top: number }> = {};
  for (const c of COUNTS) {
    const rs = records.filter((r) => r.moverCount === c);
    let wins = 0;
    let gapSum = 0;
    let skSum = 0;
    let topSum = 0;
    for (const r of rs) {
      const catchBonus = catchLinear
        ? r.catches * catchS
        : ((r.catches * (r.catches + 1)) / 2) * catchS;
      const norm = Math.pow(normRef / r.moverCount, normP);
      const sk = (r.drops * dropS + catchBonus) * norm;
      const surv = Math.max(1, r.survivors);
      let top = 0;
      for (const [delivered, caught] of r.movers) {
        if (caught) continue;
        const sc = delivered + K / surv;
        if (sc > top) top = sc;
      }
      if (sk > top + 1e-9) wins++;
      gapSum += Math.abs(sk - top);
      skSum += sk;
      topSum += top;
    }
    perCount[c] = {
      wr: wins / rs.length,
      gap: gapSum / rs.length,
      seeker: skSum / rs.length,
      top: topSum / rs.length,
    };
  }
  // 손실: 승률 50% 편차(주) + 정규화 점수격차(부).
  let loss = 0;
  for (const c of COUNTS) {
    const p = perCount[c];
    loss += (p.wr - 0.5) ** 2;
    loss += 0.015 * (p.gap / Math.max(1, (p.seeker + p.top) / 2)) ** 2;
  }
  return { loss, perCount };
}

type Cfg = {
  K: number;
  dropS: number;
  catchS: number;
  normP: number;
  lin: boolean;
  loss: number;
};
let best: Cfg | null = null;
const results: Cfg[] = [];
for (const lin of [false, true]) {
  for (const normP of [0.75, 1, 1.15, 1.3, 1.5]) {
    for (let K = 8; K <= 32; K += 2) {
      for (let dropS = 0.4; dropS <= 1.81; dropS += 0.1) {
        for (let catchS = 0.2; catchS <= 2.01; catchS += 0.1) {
          const { loss } = evalKnobs(K, dropS, catchS, normP, 4, lin);
          results.push({ K, dropS, catchS, normP, lin, loss });
          if (!best || loss < best.loss)
            best = { K, dropS, catchS, normP, lin, loss };
        }
      }
    }
  }
}
results.sort((a, b) => a.loss - b.loss);

realLog("\n=== 현재 값 평가 (GameBalance.score 기준) ===");
{
  const s = GameBalance.score;
  const { loss, perCount } = evalKnobs(
    s.survivorBonusK,
    s.dropPointScale,
    s.catchBonusScale,
    s.seekerCountNorm.power,
    s.seekerCountNorm.ref,
    s.catchBonusMode === "linear",
  );
  realLog(`loss=${loss.toFixed(4)}`);
  for (const c of COUNTS) {
    const p = perCount[c];
    realLog(
      `  movers=${c}: 술래승률=${(p.wr * 100).toFixed(1)}% 격차=${p.gap.toFixed(1)} 술래=${p.seeker.toFixed(1)} 1등=${p.top.toFixed(1)}`,
    );
  }
}

realLog("\n=== 상위 10 조합 ===");
for (const r of results.slice(0, 12)) {
  realLog(
    `K=${r.K} drop=${r.dropS.toFixed(1)} catch=${r.catchS.toFixed(1)} normP=${r.normP} ${r.lin ? "선형" : "가속"} loss=${r.loss.toFixed(4)}`,
  );
}

realLog("\n=== 최적 조합 상세 ===");
if (best) {
  const { perCount } = evalKnobs(best.K, best.dropS, best.catchS, best.normP, 4, best.lin);
  realLog(
    `K=${best.K} dropScale=${best.dropS.toFixed(1)} catchScale=${best.catchS.toFixed(1)} normP=${best.normP} ${best.lin ? "선형" : "가속"}`,
  );
  for (const c of COUNTS) {
    const p = perCount[c];
    realLog(
      `  movers=${c}: 술래승률=${(p.wr * 100).toFixed(1)}% 격차=${p.gap.toFixed(1)} 술래=${p.seeker.toFixed(1)} 1등=${p.top.toFixed(1)}`,
    );
  }
}

// --- 후보 상세 비교(잡기 보상이 유의미한 조합 위주) ---
realLog("\n=== 후보 상세 비교 ===");
for (const cand of [
  { K: 12, dropS: 1.6, catchS: 0.2, normP: 0.5 },
  { K: 8, dropS: 0.9, catchS: 0.7, normP: 1 },
  { K: 16, dropS: 1.7, catchS: 0.5, normP: 0.75 },
  { K: 20, dropS: 1.8, catchS: 0.9, normP: 1 },
  { K: 14, dropS: 1.7, catchS: 0.6, normP: 1 },
]) {
  const { loss, perCount } = evalKnobs(cand.K, cand.dropS, cand.catchS, cand.normP);
  realLog(
    `\nK=${cand.K} drop=${cand.dropS} catch=${cand.catchS} normP=${cand.normP} loss=${loss.toFixed(4)}`,
  );
  for (const c of COUNTS) {
    const p = perCount[c];
    realLog(
      `  movers=${c}: 술래승률=${(p.wr * 100).toFixed(1)}% 격차=${p.gap.toFixed(1)} 술래=${p.seeker.toFixed(1)} 1등=${p.top.toFixed(1)}`,
    );
  }
}
