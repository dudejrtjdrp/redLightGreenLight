/**
 * SeekerView.ts
 * 술래 시각 + "무궁화꽃이 피었습니다" 회전 연출.
 *  - GREEN/RESOLVE/LOBBY: 등 돌림(무버 안 봄). TELL/RED: 무버 정면 응시.
 * 캐릭터는 무버와 "다른" glb(AssetConfig.seeker)로 로드. 실패 시 절차적(원기둥) 폴백.
 * 회전은 group.rotation.y 보간(개별 물리 없음). 로드된 idle 애니는 AnimationMixer로 재생.
 */

import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { RoundPhase } from "../gameplay/RoundState";
import { GameBalance } from "../config/GameBalance";
import { EffectConfig } from "../config/EffectConfig";
import { ArtConfig } from "../config/ArtConfig";
import { AssetConfig } from "../config/AssetConfig";

export class SeekerView {
  readonly group: THREE.Group;
  /** yaw 0 = 무버(+z) 응시, yaw PI = 등 돌림. */
  private yaw = Math.PI;
  private targetYaw = Math.PI;
  private pulseEnergy = 0;
  private readonly baseScale = 1;

  private readonly procedural: THREE.Group;
  private mixer: THREE.AnimationMixer | null = null;

  constructor() {
    this.group = new THREE.Group();

    // 절차적 폴백 몸체(원기둥 + 응시 코). glb 로드 성공 시 숨김.
    this.procedural = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.CylinderGeometry(0.5, 0.62, 1.5, 14),
      new THREE.MeshStandardMaterial({ color: 0xd23b3b, roughness: 0.5 }),
    );
    body.position.y = 0.75;
    this.procedural.add(body);
    const nose = new THREE.Mesh(
      new THREE.BoxGeometry(0.22, 0.22, 0.5),
      new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4 }),
    );
    nose.position.set(0, 1.0, 0.5);
    this.procedural.add(nose);
    this.group.add(this.procedural);

    // 완주선 너머 배치(줄서기 연출과 좌표 공유: EffectConfig.seeker.standoffZ).
    const finishZ = GameBalance.track.startZ - GameBalance.track.length;
    this.group.position.set(0, 0, finishZ - EffectConfig.seeker.standoffZ);
    this.group.rotation.y = this.yaw;

    void this.loadGlb();
  }

  private async loadGlb(): Promise<void> {
    try {
      const loader = new GLTFLoader();
      const gltf = await loader.loadAsync(AssetConfig.seeker.path);
      console.log("[KayKit] 술래 모델 로드:", AssetConfig.seeker.path);

      const root = gltf.scene;
      root.scale.setScalar(AssetConfig.seeker.scale);
      // KayKit 모델은 +Z 정면 → group yaw 0(=facing)에서 무버(+z)를 그대로 바라봄.
      // (이전 +PI 보정이 반대여서 제거. 여전히 반대면 seeker.yawOffset=π)
      root.rotation.y = AssetConfig.seeker.yawOffset;
      const shadows = ArtConfig.scene.shadows;
      root.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh && shadows) m.castShadow = true;
      });

      // idle 애니(같은 Rig_Medium이면 재사용).
      const clips: THREE.AnimationClip[] = [...gltf.animations];
      for (const url of AssetConfig.animations) {
        try {
          const g = await loader.loadAsync(url);
          clips.push(...g.animations);
        } catch {
          /* 무시 */
        }
      }
      const idle =
        clips.find((c) =>
          AssetConfig.clips.idle.some((n) => c.name.toLowerCase().includes(n.toLowerCase())),
        ) ?? clips[0];
      if (idle) {
        this.mixer = new THREE.AnimationMixer(root);
        this.mixer.clipAction(idle).play();
      }

      this.procedural.visible = false;
      this.group.add(root);
    } catch (e) {
      console.warn("[KayKit] 술래 모델 로드 실패 → 절차적 유지:", e);
    }
  }

  setPhase(phase: RoundPhase): void {
    const facing = phase === RoundPhase.TELL || phase === RoundPhase.RED;
    this.targetYaw = facing ? 0 : Math.PI;
  }

  pulse(impulse: number): void {
    this.pulseEnergy = Math.min(1, this.pulseEnergy + impulse);
  }

  update(dt: number): void {
    if (this.mixer) this.mixer.update(dt);

    if (this.yaw !== this.targetYaw) {
      const rate = EffectConfig.seeker.turnSpeed * dt;
      let diff = this.targetYaw - this.yaw;
      while (diff > Math.PI) diff -= 2 * Math.PI;
      while (diff < -Math.PI) diff += 2 * Math.PI;
      const step = Math.sign(diff) * Math.min(Math.abs(diff), rate);
      this.yaw += step;
      if (Math.abs(this.targetYaw - this.yaw) < 1e-3) this.yaw = this.targetYaw;
      this.group.rotation.y = this.yaw;
    }

    if (this.pulseEnergy > 0) {
      this.pulseEnergy = Math.max(
        0,
        this.pulseEnergy - ArtConfig.seekerPulse.decayPerSec * dt,
      );
      const s = this.baseScale + this.pulseEnergy * ArtConfig.seekerPulse.scale;
      this.group.scale.setScalar(s);
    } else if (this.group.scale.x !== this.baseScale) {
      this.group.scale.setScalar(this.baseScale);
    }
  }
}
