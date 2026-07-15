/**
 * GameRenderer.ts
 * 게임 시각 레이어 통합. 데이터(무버/짐/술래) → 메쉬 동기화 + 이펙트 + 카메라 추적.
 * update(dt)는 GameLoop.update 안에서 sim 이후 호출(시각은 데이터 뒤따름).
 * 모든 뷰는 사전생성 + 풀링. 이 클래스에서 매 프레임 new 없음.
 */

import { SceneManager } from "./SceneManager";
import { MoverView } from "./MoverView";
import { SeekerView } from "./SeekerView";
import { DroppedItemsView } from "./DroppedItemsView";
import { EffectSystem } from "./EffectSystem";
import { gameBus } from "../core/EventBus";
import { GameBalance } from "../config/GameBalance";
import { EffectConfig } from "../config/EffectConfig";
import { RoundPhase } from "../gameplay/RoundState";
import { Mover } from "../gameplay/Mover";
import { CargoSystem } from "../gameplay/CargoSystem";
import "../gameplay/GameplayEvents";

export class GameRenderer {
  private readonly moverView: MoverView;
  private readonly seekerView: SeekerView;
  private readonly droppedView: DroppedItemsView;
  private readonly effects: EffectSystem;
  private prevSpeed = 0;

  constructor(
    private readonly sceneManager: SceneManager,
    private readonly player: Mover,
    cargo: CargoSystem,
  ) {
    this.moverView = new MoverView(player);
    this.seekerView = new SeekerView();
    this.droppedView = new DroppedItemsView(cargo);
    this.effects = new EffectSystem();

    const scene = sceneManager.scene;
    scene.add(this.moverView.group);
    scene.add(this.seekerView.group);
    scene.add(this.droppedView.group);
    scene.add(this.effects.group);

    // 술래 회전은 페이즈 따라, 짐 스택 흔들림은 낙하 시.
    gameBus.on("phase:change", ({ to }) => this.seekerView.setPhase(to));
    gameBus.on("item:dropped", () =>
      this.moverView.addShake(EffectConfig.cargoShake.impulseDrop),
    );
    this.seekerView.setPhase(RoundPhase.GREEN);
  }

  update(dt: number): void {
    // 정지 감지 → 스택 흔들림(작게).
    const speed = Math.abs(this.player.velocity.z);
    if (this.prevSpeed > GameBalance.judge.moveThreshold * 3 &&
        speed <= GameBalance.judge.moveThreshold) {
      this.moverView.addShake(EffectConfig.cargoShake.impulseStop);
    }
    this.prevSpeed = speed;

    this.moverView.update(dt);
    this.seekerView.update(dt);
    this.droppedView.update();
    this.effects.update(dt);

    this.followCamera();
  }

  /** 카메라가 무버를 뒤에서 추적. */
  private followCamera(): void {
    const cam = this.sceneManager.camera;
    const c = EffectConfig.camera;
    cam.position.x = 0;
    cam.position.y = c.height;
    cam.position.z = this.player.position.z + c.back;
    cam.lookAt(0, 0.6, this.player.position.z - c.lookAhead);
  }
}
