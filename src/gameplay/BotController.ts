/**
 * BotController.ts
 * 봇 AI 입력 소스. MoverInput 인터페이스를 구현해 PlayerSystem에 사람 입력처럼 꽂힌다.
 * (봇 전용 이동/판정 코드 없음 — 사람과 100% 동일한 규칙(PlayerSystem)을 탄다.)
 *
 * 행동 모델(사람 흉내):
 *  - GREEN : 출발 지연 후 전진. 공격성에 따라 FAST/CAREFUL 선택. 넓은 길을 좌우 배회.
 *  - TELL  : 반응시간 + 공격성 비례 "밀어붙임" 후 정지. (공격적일수록 늦게 멈춰 위험)
 *  - RED   : 전진 해제(드물게 지각 → 탈락). 균형이 무너지면 성향에 따라
 *            "보정(경고 소모)" vs "흘림(짐 낙하)"의 RED 딜레마를 스스로 결정.
 *  - 균형  : |tilt| 임계 초과 시 쏠린 방향으로 counter 입력(히스테리시스로 과보정 방지).
 *
 * 랜덤은 주입 가능(결정론 시뮬 대비). 기본 Math.random.
 */

import { BotConfig } from "../config/BotConfig";
import { BalanceConfig } from "../config/BalanceConfig";
import { GameBalance } from "../config/GameBalance";
import { Mover, MoverInput, MoverStatus, SpeedMode } from "./Mover";
import { RoundPhase } from "./RoundState";
import { RoundStateMachine } from "./RoundStateMachine";

type Rng = () => number;

/** 봇 개성(생성 시 1회 샘플). */
interface Persona {
  /** 0(신중)~1(공격적). FAST 선택/TELL 밀어붙임에 반영. */
  aggression: number;
  /** 페이즈 전환 반응시간(초). */
  reaction: number;
  /** GREEN 출발 지연(초). */
  startDelay: number;
}

export class BotController implements MoverInput {
  private forward = false;
  private lateralOut = 0;
  private mode: SpeedMode = SpeedMode.CAREFUL;

  private readonly persona: Persona;
  private prevPhase: RoundPhase = RoundPhase.LOBBY;
  private sincePhase = 0;

  /** 이번 TELL에서 멈추기로 한 시점(초). */
  private tellStopAt = 0;
  /** RED 지각(사람 실수) 여부/유지시간. */
  private redLate = false;
  private redLateUntil = 0;

  /** 균형 보정 중 여부(히스테리시스). */
  private correcting = false;
  /** RED 딜레마: 이번 RED에서 "보정" 선택 여부(진입 시 1회 결정 유지). */
  private redProtect = false;

  /** 좌우 배회 목표 x / 재선정 타이머. */
  private wanderX = 0;
  private wanderTimer = 0;

  /** FAST 버스트 상태(질주 hold ↔ 휴식 rest). */
  private burstTimer = 0;
  private burstResting = false;
  /** 예측 정지 시점(GREEN 경과 기준, GREEN 진입 시 샘플). */
  private anticipateAt = Infinity;

  constructor(
    private readonly mover: Mover,
    private readonly round: RoundStateMachine,
    private readonly rng: Rng = Math.random,
  ) {
    this.persona = {
      aggression: rng(),
      reaction: this.range(BotConfig.reaction.min, BotConfig.reaction.max),
      startDelay: this.range(
        BotConfig.greenStartDelay.min,
        BotConfig.greenStartDelay.max,
      ),
    };
    this.pickWanderTarget();
  }

  // --- MoverInput ---
  get isForward(): boolean {
    return this.forward;
  }
  get lateral(): number {
    return this.lateralOut;
  }
  get speedMode(): SpeedMode {
    return this.mode;
  }

  /** 매 스텝 호출(PlayerSystem.update 이전). */
  update(dt: number): void {
    if (this.mover.status !== MoverStatus.ALIVE) {
      this.forward = false;
      this.lateralOut = 0;
      return;
    }

    const phase = this.round.phase;
    if (phase !== this.prevPhase) {
      this.onPhaseEnter(phase);
      this.prevPhase = phase;
      this.sincePhase = 0;
    }
    this.sincePhase += dt;

    this.updateForward(phase, dt);
    this.updateLateral(phase, dt);
  }

  /** 페이즈 진입 1회 처리(반응/결정 샘플). */
  private onPhaseEnter(phase: RoundPhase): void {
    const p = this.persona;
    switch (phase) {
      case RoundPhase.GREEN: {
        // FAST 선택: 기본 확률 + 공격성 보너스. 위험 중이면 CAREFUL 강제.
        const sc = BotConfig.speedChoice;
        const fastP = sc.fastBase + sc.fastAggrBonus * p.aggression;
        const danger = sc.carefulWhenDanger && this.mover.inDanger;
        this.mode =
          !danger && this.rng() < fastP ? SpeedMode.FAST : SpeedMode.CAREFUL;
        // FAST 버스트 초기화: 첫 질주 hold + 예측 정지 시점 샘플.
        this.burstResting = false;
        this.burstTimer = this.range(
          BotConfig.fastBurst.hold.min,
          BotConfig.fastBurst.hold.max,
        );
        this.anticipateAt = this.range(
          BotConfig.fastBurst.anticipateAfter.min,
          BotConfig.fastBurst.anticipateAfter.max,
        );
        break;
      }
      case RoundPhase.TELL: {
        // 멈춤 시점 = 반응시간 + (CAREFUL만) 공격성 비례 밀어붙임.
        // FAST는 감속 ~1s가 필요해 반응 즉시 릴리즈해야 산다.
        const push =
          this.mode === SpeedMode.CAREFUL
            ? p.aggression * BotConfig.tellPushMax
            : 0;
        this.tellStopAt = p.reaction + push;
        break;
      }
      case RoundPhase.RED: {
        // 지각(사람 실수) 샘플.
        this.redLate = this.rng() < BotConfig.redLateChance;
        this.redLateUntil = this.redLate
          ? this.range(BotConfig.redLateHold.min, BotConfig.redLateHold.max)
          : 0;
        // RED 딜레마 사전 결정: 짐이 많을수록 지키는(보정) 쪽으로.
        const b = BotConfig.balance;
        const protectP = b.protectBase + b.protectPerCargo * this.mover.cargo;
        this.redProtect = this.rng() < protectP;
        break;
      }
      default:
        break;
    }
  }

  /** 전진 입력 결정. */
  private updateForward(phase: RoundPhase, dt: number): void {
    switch (phase) {
      case RoundPhase.GREEN: {
        if (this.sincePhase < this.persona.startDelay) {
          this.forward = false;
          break;
        }
        if (this.mode !== SpeedMode.FAST) {
          this.forward = true;
          break;
        }
        // 예측 정지: GREEN이 길어지면 곧 레드 → 질주 중단(감속 여유 확보).
        if (this.sincePhase >= this.anticipateAt) {
          this.forward = false;
          break;
        }
        // FAST 버스트: hold 질주 → rest 릴리즈(자발적 감속) 반복.
        this.burstTimer -= dt;
        if (this.burstTimer <= 0) {
          this.burstResting = !this.burstResting;
          const b = BotConfig.fastBurst;
          this.burstTimer = this.burstResting
            ? this.range(b.rest.min, b.rest.max)
            : this.range(b.hold.min, b.hold.max);
        }
        this.forward = !this.burstResting;
        break;
      }
      case RoundPhase.TELL:
        // tellStopAt 전까진 밀어붙임(공격적 봇일수록 김) → 이후 정지.
        this.forward = this.sincePhase < this.tellStopAt;
        break;
      case RoundPhase.RED:
        // 지각 봇만 잠깐 더 전진(대부분 탈락). 나머진 즉시 해제.
        this.forward = this.redLate && this.sincePhase < this.redLateUntil;
        break;
      default:
        this.forward = false;
        break;
    }
  }

  /** 좌우 입력 결정: 균형 보정(우선) > 배회. */
  private updateLateral(phase: RoundPhase, dt: number): void {
    const b = BotConfig.balance;
    const tilt = this.mover.tilt;
    const a = Math.abs(tilt);
    const dropTh = BalanceConfig.tiltDropThreshold;

    if (phase === RoundPhase.RED) {
      // RED 딜레마: 낙하 직전에만 개입 여부 판단.
      const canCorrect =
        this.redProtect && this.mover.warnings < BalanceConfig.warningMax - 1;
      if (this.correcting) {
        if (a <= dropTh * b.redReleaseFrac || !canCorrect) {
          this.correcting = false;
        }
      } else if (canCorrect && a >= dropTh * b.redDecideFrac) {
        this.correcting = true;
      }
      this.lateralOut = this.correcting ? Math.sign(tilt) : 0;
      return;
    }

    // GREEN/TELL/RESOLVE: 평시 균형 보정(히스테리시스).
    if (this.correcting) {
      if (a <= b.releaseThreshold) this.correcting = false;
    } else if (a >= b.correctThreshold) {
      this.correcting = true;
    }
    if (this.correcting) {
      this.lateralOut = Math.sign(tilt);
      return;
    }

    // 배회(넓어진 길 활용): GREEN 이동 중에만.
    const w = BotConfig.wander;
    if (!w.enabled || phase !== RoundPhase.GREEN || !this.forward) {
      this.lateralOut = 0;
      return;
    }
    this.wanderTimer -= dt;
    if (this.wanderTimer <= 0) this.pickWanderTarget();
    const dx = this.wanderX - this.mover.position.x;
    this.lateralOut =
      Math.abs(dx) <= w.arriveEps ? 0 : Math.sign(dx) * w.strength;
  }

  private pickWanderTarget(): void {
    const w = BotConfig.wander;
    const half = GameBalance.track.laneHalfWidth * w.laneFrac;
    this.wanderX = (this.rng() * 2 - 1) * half;
    this.wanderTimer = this.range(w.interval.min, w.interval.max);
  }

  private range(min: number, max: number): number {
    return min + (max - min) * this.rng();
  }
}
