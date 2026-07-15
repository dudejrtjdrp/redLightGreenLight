/**
 * RoundStateMachine.ts
 * 라운드 진행 상태머신. 시간 기반 페이즈 전환만 담당(정산/판정 로직은 이후 Phase).
 *
 * 원칙:
 *  - 모든 지속시간은 GameBalance.ts에서 읽는다(하드코딩 금지).
 *  - 매 프레임 GameLoop.update(dt)에서 update(dt) 1회 호출로 구동(불필요 tick 없음).
 *  - 페이즈 전환 시 "phase:change" 이벤트만 emit. 구독자의 실제 처리는 이후 Phase.
 *  - 랜덤은 주입 가능(결정론 테스트 대비). 기본 Math.random.
 */

import { GameBalance } from "../config/GameBalance";
import { gameBus } from "../core/EventBus";
import { RoundPhase } from "./RoundState";
// 이벤트 타입(phase:change 등)은 GameplayEvents의 선언 병합으로 전역 반영됨.
import "./GameplayEvents";

type Rng = () => number;

export class RoundStateMachine {
  private _phase: RoundPhase = RoundPhase.LOBBY;
  /** 현재 페이즈 경과 시간(초) */
  private phaseTime = 0;
  /** 현재 페이즈 목표 지속시간(초). LOBBY/END는 Infinity(자동전환 없음). */
  private phaseDuration = Infinity;
  /** 라운드 전체 경과(초). 활성 페이즈에서만 누적. */
  private roundTime = 0;
  /** 이번 라운드의 최대 지속시간(초). start 시 확정. 빈 턴 반환 시 연장됨. */
  private roundMax = 0;
  /** 직전 진입한 RED의 지속시간(초). 빈 턴 반환 계산용. */
  private redDuration = 0;
  /** 현재 RED 동안 활동(이동/체포/낙하)이 있었는지. 빈 턴 판정용. */
  private redHadActivity = false;

  constructor(private readonly rng: Rng = Math.random) {}

  get phase(): RoundPhase {
    return this._phase;
  }
  get elapsedRound(): number {
    return this.roundTime;
  }
  get phaseElapsed(): number {
    return this.phaseTime;
  }
  get isActive(): boolean {
    return this._phase !== RoundPhase.LOBBY && this._phase !== RoundPhase.END;
  }

  /** 라운드 시작: LOBBY → GREEN. 라운드 최대시간 확정. */
  start(): void {
    if (this._phase !== RoundPhase.LOBBY) return;
    const { maxDurationMin, maxDurationMax } = GameBalance.round;
    this.roundMax = this.rand(maxDurationMin, maxDurationMax);
    this.roundTime = 0;
    this.setPhase(RoundPhase.GREEN);
  }

  /** 외부 종료 트리거(전원 완주/탈락 시 다음 Phase에서 호출). */
  forceEnd(): void {
    if (this._phase === RoundPhase.END) return;
    this.setPhase(RoundPhase.END);
  }

  /**
   * RED 중 발생한 활동(무버 이동/체포/짐 낙하)을 상태머신에 통지.
   * 빈 턴(뒤돌았는데 아무도 안 움직이고 낙하 0) 판정에 사용.
   * RED가 아닐 때 호출은 무시.
   */
  registerActivity(): void {
    if (this._phase === RoundPhase.RED) this.redHadActivity = true;
  }

  /** 고정 스텝 갱신. GameLoop.update(dt)에서 호출. */
  update(dt: number): void {
    if (!this.isActive) return;
    this.phaseTime += dt;
    this.roundTime += dt;
    if (this.phaseTime >= this.phaseDuration) {
      this.advance();
    }
  }

  /** 현재 페이즈에서 다음 페이즈로 진행. */
  private advance(): void {
    switch (this._phase) {
      case RoundPhase.GREEN:
        this.setPhase(RoundPhase.TELL);
        break;
      case RoundPhase.TELL:
        this.setPhase(RoundPhase.RED);
        break;
      case RoundPhase.RED:
        // 빈 턴 기회비용 반환(간단 버전): RED 동안 활동이 전혀 없었으면
        // 술래가 헛돈 것이므로 그 RED 시간을 라운드 예산에 되돌려준다(그린타임 반환).
        if (!this.redHadActivity) this.roundMax += this.redDuration;
        this.setPhase(RoundPhase.RESOLVE);
        break;
      case RoundPhase.RESOLVE:
        // 라운드 시간 초과면 종료, 아니면 다음 사이클 GREEN.
        if (this.roundTime >= this.roundMax) {
          this.setPhase(RoundPhase.END);
        } else {
          this.setPhase(RoundPhase.GREEN);
        }
        break;
      default:
        break;
    }
  }

  /** 페이즈 전환 + 지속시간 재산정 + 이벤트 emit. */
  private setPhase(next: RoundPhase): void {
    const from = this._phase;
    this._phase = next;
    this.phaseTime = 0;
    this.phaseDuration = this.durationFor(next);
    if (next === RoundPhase.RED) {
      // RED 진입: 활동 플래그 초기화 + 이번 RED 길이 기록(빈 턴 반환용).
      this.redHadActivity = false;
      this.redDuration = this.phaseDuration;
    }
    gameBus.emit("phase:change", { from, to: next });
  }

  /** 각 페이즈 지속시간을 GameBalance에서 산출. */
  private durationFor(phase: RoundPhase): number {
    const s = GameBalance.signal;
    switch (phase) {
      case RoundPhase.GREEN:
        return this.rand(s.greenMin, s.greenMax);
      case RoundPhase.TELL:
        // 전환창: 고정 0.8~1.2s. 딜레마 성립의 근거(RoundState.ts 참고).
        return this.rand(s.tellMin, s.tellMax);
      case RoundPhase.RED:
        return this.rand(s.redMin, s.redMax);
      case RoundPhase.RESOLVE:
        return s.resolveDuration;
      default:
        return Infinity; // LOBBY / END
    }
  }

  private rand(min: number, max: number): number {
    return min + (max - min) * this.rng();
  }
}
