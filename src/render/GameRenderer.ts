/**
 * GameRenderer.ts
 * 게임 시각 레이어 통합. 데이터(무버/짐/술래) → 메쉬 동기화 + 이펙트 + 카메라 추적.
 * update(dt)는 GameLoop.update 안에서 sim 이후 호출(시각은 데이터 뒤따름).
 * 모든 뷰는 사전생성 + 풀링. 이 클래스에서 매 프레임 new 없음.
 */

import * as THREE from "three";
import { SceneManager } from "./SceneManager";
import { MoverView } from "./MoverView";
import { SeekerView } from "./SeekerView";
import { DroppedItemsView } from "./DroppedItemsView";
import { EffectSystem } from "./EffectSystem";
import { gameBus } from "../core/EventBus";
import { EffectConfig } from "../config/EffectConfig";
import { ArtConfig } from "../config/ArtConfig";
import { RoundPhase } from "../gameplay/RoundState";
import { Mover } from "../gameplay/Mover";
import { CargoSystem } from "../gameplay/CargoSystem";
import "../gameplay/GameplayEvents";

export class GameRenderer {
  private readonly moverView: MoverView;
  private readonly seekerView: SeekerView;
  private readonly droppedView: DroppedItemsView;
  private readonly effects: EffectSystem;

  // 스크린셰이크 상태
  private shakeEnergy = 0;
  private shakeTime = 0;
  /** 낙하 아크 시작점 계산용 재사용 벡터(할당 방지). */
  private readonly scratch = new THREE.Vector3();

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

    // 페이즈 → 술래 회전 + 카멜레온 색 변화.
    gameBus.on("phase:change", ({ to }) => {
      this.seekerView.setPhase(to);
      this.moverView.setPhase(to);
    });
    // 낙하 주스: 움찔 + 스크린셰이크 + 아크 연출.
    // 아크 시작점(from)은 방금 분리된 맨 위 짐의 "실제 월드 좌표"(팝인 방지).
    // 분리 후 mover.cargo는 이미 -1 → 그 값이 곧 떨어진 박스의 인덱스.
    gameBus.on("item:dropped", (payload) => {
      this.moverView.addFlinch(ArtConfig.flinch.dropImpulse);
      this.addScreenShake(ArtConfig.screenShake.dropEnergy);
      const from = this.moverView.getBoxWorldPosition(this.player.cargo, this.scratch);
      this.effects.spawn(from, payload.to);
    });
    // 탈락 주스: 스크린셰이크(카멜레온 굳음/눈 뱅글은 MoverView가 status로 처리).
    gameBus.on("mover:caught", () =>
      this.addScreenShake(ArtConfig.screenShake.caughtEnergy),
    );
    // 경고 주스: 카멜레온 흰색 플래시 + 술래 응시 강화.
    gameBus.on("mover:warned", () => {
      this.moverView.flash(ArtConfig.warnFlash.impulse);
      this.seekerView.pulse(ArtConfig.seekerPulse.impulse);
    });

    this.seekerView.setPhase(RoundPhase.GREEN);
    this.moverView.setPhase(RoundPhase.GREEN);
  }

  private addScreenShake(energy: number): void {
    this.shakeEnergy = Math.min(1, this.shakeEnergy + energy);
  }

  update(dt: number): void {
    // 스택 흔들림은 이제 데이터 tilt가 소스(MoverView가 직접 반영).
    this.moverView.update(dt);
    this.seekerView.update(dt);
    this.droppedView.update();
    this.effects.update(dt);

    // 스크린셰이크 감쇠.
    if (this.shakeEnergy > 0) {
      this.shakeTime += dt;
      this.shakeEnergy = Math.max(
        0,
        this.shakeEnergy - ArtConfig.screenShake.decayPerSec * dt,
      );
    }

    this.followCamera();
  }

  /** 카메라가 무버를 뒤에서 추적 + 스크린셰이크 오프셋. */
  private followCamera(): void {
    const cam = this.sceneManager.camera;
    const c = EffectConfig.camera;
    const ss = ArtConfig.screenShake;
    let ox = 0;
    let oy = 0;
    if (this.shakeEnergy > 0) {
      const a = this.shakeEnergy * ss.maxOffset;
      ox = Math.sin(this.shakeTime * ss.freq) * a;
      oy = Math.cos(this.shakeTime * ss.freq * 1.3) * a * 0.6;
    }
    cam.position.x = ox;
    cam.position.y = c.height + oy;
    cam.position.z = this.player.position.z + c.back;
    cam.lookAt(0, 0.6, this.player.position.z - c.lookAhead);
  }
}
