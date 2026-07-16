/**
 * GameRenderer.ts
 * 게임 시각 레이어 통합. 데이터(무버/짐/술래) → 메쉬 동기화 + 이펙트 + 카메라 추적.
 * update(dt)는 GameLoop.update 안에서 sim 이후 호출(시각은 데이터 뒤따름).
 *
 * 아바타: 절차적(MoverView)로 즉시 시작 → KayKit glb(CharacterView) 로드 성공 시 교체(폴백 안전).
 */

import * as THREE from "three";
import { SceneManager } from "./SceneManager";
import { MoverView } from "./MoverView";
import { CharacterView } from "./CharacterView";
import { SeekerView } from "./SeekerView";
import { DroppedItemsView } from "./DroppedItemsView";
import { EffectSystem } from "./EffectSystem";
import { MapView } from "./MapView";
import { gameBus } from "../core/EventBus";
import { EffectConfig } from "../config/EffectConfig";
import { ArtConfig } from "../config/ArtConfig";
import { RoundPhase } from "../gameplay/RoundState";
import { Mover } from "../gameplay/Mover";
import { CargoSystem } from "../gameplay/CargoSystem";
import "../gameplay/GameplayEvents";

/** 절차적/​glb 아바타 공통 인터페이스. */
interface MoverAvatar {
  readonly group: THREE.Object3D;
  setPhase(phase: RoundPhase): void;
  addFlinch(impulse: number): void;
  flash(impulse: number): void;
  getBoxWorldPosition(index: number, out: THREE.Vector3): THREE.Vector3;
  update(dt: number): void;
}

export class GameRenderer {
  /** 현재 활성 아바타(절차적 또는 glb). */
  private avatar: MoverAvatar;
  private readonly seekerView: SeekerView;
  private readonly droppedView: DroppedItemsView;
  private readonly effects: EffectSystem;

  private currentPhase: RoundPhase = RoundPhase.GREEN;

  private shakeEnergy = 0;
  private shakeTime = 0;
  private readonly scratch = new THREE.Vector3();

  constructor(
    private readonly sceneManager: SceneManager,
    private readonly player: Mover,
    cargo: CargoSystem,
  ) {
    const moverView = new MoverView(player);
    this.avatar = moverView; // 폴백/기본
    this.seekerView = new SeekerView();
    this.droppedView = new DroppedItemsView(cargo);
    this.effects = new EffectSystem();

    const scene = sceneManager.scene;
    scene.add(this.avatar.group);
    scene.add(this.seekerView.group);
    scene.add(this.droppedView.group);
    scene.add(this.effects.group);

    gameBus.on("phase:change", ({ to }) => {
      this.currentPhase = to;
      this.seekerView.setPhase(to);
      this.avatar.setPhase(to);
    });
    gameBus.on("item:dropped", (payload) => {
      this.avatar.addFlinch(ArtConfig.flinch.dropImpulse);
      this.addScreenShake(ArtConfig.screenShake.dropEnergy);
      const from = this.avatar.getBoxWorldPosition(this.player.cargo, this.scratch);
      this.effects.spawn(from, payload.to, payload.itemId);
    });
    gameBus.on("mover:caught", () =>
      this.addScreenShake(ArtConfig.screenShake.caughtEnergy),
    );
    gameBus.on("mover:warned", () => {
      this.avatar.flash(ArtConfig.warnFlash.impulse);
      this.seekerView.pulse(ArtConfig.seekerPulse.impulse);
    });

    this.seekerView.setPhase(RoundPhase.GREEN);
    this.avatar.setPhase(RoundPhase.GREEN);

    // KayKit glb 비동기 로드 → 성공 시 절차적 아바타를 교체.
    void this.tryLoadCharacter(moverView);
    // 맵(도로) 비동기 로드 → 실패 시 바닥 플레이스홀더 유지.
    // MapView.create()가 성공 시 scene에 직접 group을 add하므로 참조 보관은 불필요.
    void MapView.create(sceneManager.scene);
  }

  private async tryLoadCharacter(fallback: MoverView): Promise<void> {
    try {
      const cv = await CharacterView.create(this.player, ArtConfig.scene.shadows);
      if (!cv) return; // 폴백 유지
      // 교체: 절차적 제거 → glb 추가.
      this.sceneManager.scene.remove(fallback.group);
      this.sceneManager.scene.add(cv.group);
      cv.setPhase(this.currentPhase);
      this.avatar = cv;
      console.log("[KayKit] glb 아바타로 교체 완료");
    } catch (e) {
      console.warn("[KayKit] 캐릭터 초기화 실패 → 절차적 유지:", e);
    }
  }

  private addScreenShake(energy: number): void {
    this.shakeEnergy = Math.min(1, this.shakeEnergy + energy);
  }

  update(dt: number): void {
    this.avatar.update(dt); // mixer.update(dt) 포함(glb일 때)
    this.seekerView.update(dt);
    this.droppedView.update();
    this.effects.update(dt);

    if (this.shakeEnergy > 0) {
      this.shakeTime += dt;
      this.shakeEnergy = Math.max(
        0,
        this.shakeEnergy - ArtConfig.screenShake.decayPerSec * dt,
      );
    }

    this.followCamera();
  }

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
