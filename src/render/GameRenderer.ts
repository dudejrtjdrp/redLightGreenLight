/**
 * GameRenderer.ts
 * 게임 시각 레이어 통합. 데이터(무버들/짐/술래) → 메쉬 동기화 + 이펙트 + 카메라 추적.
 * update(dt)는 GameLoop.update 안에서 sim 이후 호출(시각은 데이터 뒤따름).
 *
 * 멀티 무버(봇 모드) 개정:
 *  - 무버별 아바타(Map<moverId, avatar>). 절차적(MoverView) 즉시 시작 →
 *    KayKit glb(CharacterView) 로드 성공 시 개별 교체(폴백 안전).
 *  - 플레이어는 AssetConfig.player 모델, 봇은 AssetConfig.botModels 순환 배정.
 *  - 카메라/플린치/이펙트는 해당 무버 기준으로 라우팅(item:dropped.byMoverId 등).
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
import { AssetConfig } from "../config/AssetConfig";
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
  /** 무버 id → 활성 아바타(절차적 또는 glb). */
  private readonly avatars = new Map<number, MoverAvatar>();
  private readonly moverById = new Map<number, Mover>();
  private readonly seekerView: SeekerView;
  private readonly droppedView: DroppedItemsView;
  private readonly effects: EffectSystem;

  private currentPhase: RoundPhase = RoundPhase.GREEN;

  private shakeEnergy = 0;
  private shakeTime = 0;
  private readonly scratch = new THREE.Vector3();

  constructor(
    private readonly sceneManager: SceneManager,
    movers: readonly Mover[],
    /** 카메라 추적/플레이어 전용 연출 기준 무버 id. */
    private readonly playerId: number,
    cargo: CargoSystem,
  ) {
    this.seekerView = new SeekerView();
    this.droppedView = new DroppedItemsView(cargo);
    this.effects = new EffectSystem();

    const scene = sceneManager.scene;
    scene.add(this.seekerView.group);
    scene.add(this.droppedView.group);
    scene.add(this.effects.group);

    // 무버별 절차적 아바타 즉시 생성 → glb 비동기 교체.
    let botIdx = 0;
    for (const m of movers) {
      this.moverById.set(m.id, m);
      const view = new MoverView(m);
      this.avatars.set(m.id, view);
      scene.add(view.group);

      const isPlayer = m.id === playerId;
      const path = isPlayer
        ? AssetConfig.player.path
        : AssetConfig.botModels[botIdx++ % AssetConfig.botModels.length];
      void this.tryLoadCharacter(m, view, path);
    }

    gameBus.on("phase:change", ({ to }) => {
      this.currentPhase = to;
      this.seekerView.setPhase(to);
      for (const a of this.avatars.values()) a.setPhase(to);
    });
    gameBus.on("item:dropped", (payload) => {
      const avatar = this.avatars.get(payload.byMoverId);
      const mover = this.moverById.get(payload.byMoverId);
      if (!avatar || !mover) return;
      avatar.addFlinch(ArtConfig.flinch.dropImpulse);
      // 화면 흔들림은 플레이어 자신의 낙하에만(봇 낙하로 멀미 유발 방지).
      if (payload.byMoverId === this.playerId) {
        this.addScreenShake(ArtConfig.screenShake.dropEnergy);
      }
      const from = avatar.getBoxWorldPosition(mover.cargo, this.scratch);
      this.effects.spawn(from, payload.to, payload.itemId);
    });
    gameBus.on("mover:caught", ({ moverId }) => {
      if (moverId === this.playerId) {
        this.addScreenShake(ArtConfig.screenShake.caughtEnergy);
      }
    });
    gameBus.on("mover:warned", ({ moverId }) => {
      this.avatars.get(moverId)?.flash(ArtConfig.warnFlash.impulse);
      this.seekerView.pulse(ArtConfig.seekerPulse.impulse);
    });

    this.seekerView.setPhase(RoundPhase.GREEN);
    for (const a of this.avatars.values()) a.setPhase(RoundPhase.GREEN);

    // 맵(도로) 비동기 로드 → 실패 시 바닥 플레이스홀더 유지.
    void MapView.create(sceneManager.scene);
  }

  private async tryLoadCharacter(
    mover: Mover,
    fallback: MoverView,
    modelPath: string,
  ): Promise<void> {
    try {
      const cv = await CharacterView.create(mover, ArtConfig.scene.shadows, modelPath);
      if (!cv) return; // 폴백 유지
      // 교체: 절차적 제거 → glb 추가.
      this.sceneManager.scene.remove(fallback.group);
      this.sceneManager.scene.add(cv.group);
      cv.setPhase(this.currentPhase);
      this.avatars.set(mover.id, cv);
      console.log(`[KayKit] 무버#${mover.id} glb 아바타 교체 완료 (${modelPath})`);
    } catch (e) {
      console.warn(`[KayKit] 무버#${mover.id} 캐릭터 초기화 실패 → 절차적 유지:`, e);
    }
  }

  private addScreenShake(energy: number): void {
    this.shakeEnergy = Math.min(1, this.shakeEnergy + energy);
  }

  update(dt: number): void {
    for (const a of this.avatars.values()) a.update(dt); // mixer.update(dt) 포함(glb일 때)
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
    const player = this.moverById.get(this.playerId);
    if (!player) return;
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
    cam.position.z = player.position.z + c.back;
    cam.lookAt(0, 0.6, player.position.z - c.lookAhead);
  }
}
