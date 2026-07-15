/**
 * InputController.ts
 * 무버 1명 조작용 키보드 입력. 상태만 보관하고, 소비는 PlayerSystem이 매 스텝 폴링.
 *
 * 조작:
 *  - 전진: Space / ArrowUp / W  (hold = 전진, release = 정지)
 *  - 속도모드 토글: Shift / E  (빠름 100% ↔ 신중 50%)
 *
 * 이벤트 리스너는 keydown/keyup 뿐. 폴링 기반이라 프레임마다 DOM 접근 없음.
 */

import { SpeedMode } from "../gameplay/Mover";

const FORWARD_KEYS = new Set(["Space", "ArrowUp", "KeyW"]);
const TOGGLE_KEYS = new Set(["ShiftLeft", "ShiftRight", "KeyE"]);

export class InputController {
  private forward = false;
  private mode: SpeedMode = SpeedMode.CAREFUL;

  constructor(private readonly target: Window = window) {
    this.target.addEventListener("keydown", this.onKeyDown);
    this.target.addEventListener("keyup", this.onKeyUp);
  }

  /** 전진 입력 유지 여부 */
  get isForward(): boolean {
    return this.forward;
  }

  /** 현재 속도 모드 */
  get speedMode(): SpeedMode {
    return this.mode;
  }

  private readonly onKeyDown = (e: KeyboardEvent): void => {
    if (FORWARD_KEYS.has(e.code)) {
      this.forward = true;
      e.preventDefault(); // Space 스크롤 등 방지
      return;
    }
    if (TOGGLE_KEYS.has(e.code)) {
      if (e.repeat) return; // 오토리핏은 토글 1회만
      this.mode =
        this.mode === SpeedMode.FAST ? SpeedMode.CAREFUL : SpeedMode.FAST;
      e.preventDefault();
    }
  };

  private readonly onKeyUp = (e: KeyboardEvent): void => {
    if (FORWARD_KEYS.has(e.code)) {
      this.forward = false;
      e.preventDefault();
    }
  };

  dispose(): void {
    this.target.removeEventListener("keydown", this.onKeyDown);
    this.target.removeEventListener("keyup", this.onKeyUp);
  }
}
