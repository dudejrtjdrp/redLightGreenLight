/**
 * GameLoop.ts
 * 고정 timestep 게임 루프.
 *  - update(dt): 결정론적 시뮬레이션. 항상 동일한 dt(고정 스텝)로 호출.
 *  - render(alpha): 프레임 보간용 alpha(0~1)로 렌더. 시뮬레이션과 분리.
 *  - requestAnimationFrame 기반. rAF 외 불필요한 tick 없음.
 *  - dt 상한(maxFrameTime)으로 "death spiral" 방지.
 *
 * 참고: Fix Your Timestep (Gaffer on Games) 패턴.
 */

export interface GameLoopCallbacks {
  /** 고정 스텝 시뮬레이션. dt는 항상 fixedStep(초). */
  update: (dt: number) => void;
  /** 렌더. alpha는 마지막 두 시뮬 스텝 사이 보간 계수(0~1). */
  render: (alpha: number) => void;
}

export interface GameLoopOptions {
  /** 시뮬레이션 스텝 간격(초). 기본 1/60. */
  fixedStep?: number;
  /**
   * 한 프레임에서 소비할 수 있는 최대 실제 경과 시간(초).
   * 이 값을 넘는 렉이 발생해도 시뮬레이션이 폭주(스파이럴)하지 않도록 상한.
   */
  maxFrameTime?: number;
}

export class GameLoop {
  private readonly update: (dt: number) => void;
  private readonly render: (alpha: number) => void;
  private readonly fixedStep: number;
  private readonly maxFrameTime: number;

  private accumulator = 0;
  private lastTime = 0;
  private rafId = 0;
  private running = false;

  constructor(callbacks: GameLoopCallbacks, options: GameLoopOptions = {}) {
    this.update = callbacks.update;
    this.render = callbacks.render;
    this.fixedStep = options.fixedStep ?? 1 / 60;
    this.maxFrameTime = options.maxFrameTime ?? 0.25; // 최대 0.25s 만 소비
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.lastTime = performance.now();
    this.accumulator = 0;
    this.rafId = requestAnimationFrame(this.tick);
  }

  stop(): void {
    if (!this.running) return;
    this.running = false;
    cancelAnimationFrame(this.rafId);
  }

  /** rAF 콜백. 화살표 함수로 this 바인딩 고정. */
  private readonly tick = (now: number): void => {
    if (!this.running) return;

    // 실제 경과 시간(초). dt 상한으로 스파이럴 방지.
    let frameTime = (now - this.lastTime) / 1000;
    this.lastTime = now;
    if (frameTime > this.maxFrameTime) frameTime = this.maxFrameTime;

    this.accumulator += frameTime;

    // 고정 스텝으로 시뮬레이션을 필요한 횟수만큼 소비.
    while (this.accumulator >= this.fixedStep) {
      this.update(this.fixedStep);
      this.accumulator -= this.fixedStep;
    }

    // 남은 잔여시간 비율 = 다음 스텝까지의 보간 alpha.
    const alpha = this.accumulator / this.fixedStep;
    this.render(alpha);

    this.rafId = requestAnimationFrame(this.tick);
  };

  get isRunning(): boolean {
    return this.running;
  }
}
