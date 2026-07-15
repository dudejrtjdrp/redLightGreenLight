/**
 * MoverView.ts
 * 무버 = 귀여운 로우폴리 카멜레온. 외부 모델 없이 Three.js 프리미티브 조합으로 제작.
 *
 * 성능:
 *  - 지오메트리는 모듈 스코프에서 공유(SHARED) → 무버 여러 명이어도 지오 재사용, draw call 최소화.
 *  - 색이 바뀌는 몸통 머티리얼만 인스턴스별로 소유. 눈/다리/꼬리/짐은 공유 머티리얼.
 *  - 매 프레임 new 없음. 색/눈크기/흔들림은 in-place lerp.
 *
 * 아트=가독성(색-상태 매핑):
 *  - GREEN: 초록 / 눈 평상.
 *  - TELL : 초록→빨강 lerp(위험 예고를 몸으로).
 *  - RED  : 빨강/경직, 눈 크게.
 *  - 탈락 : 빨강으로 굳고 눈 뱅글.
 * 짐 스택은 등 위에 쌓이며, 높을수록 더 흔들려 "위태로움"을 보여준다(Phase 6 lean/shake 재사용).
 */

import * as THREE from "three";
import { Mover, MoverStatus, SpeedMode } from "../gameplay/Mover";
import { RoundPhase } from "../gameplay/RoundState";
import { ItemConfig } from "../config/ItemConfig";
import { EffectConfig } from "../config/EffectConfig";
import { ArtConfig } from "../config/ArtConfig";

// --- 공유 지오메트리(로우폴리, 전 인스턴스 재사용) ---
const SHARED = {
  body: new THREE.SphereGeometry(1, 12, 10),
  eye: new THREE.SphereGeometry(1, 10, 8),
  pupil: new THREE.SphereGeometry(1, 8, 6),
  leg: new THREE.CylinderGeometry(0.07, 0.05, 0.34, 6),
  tail: new THREE.SphereGeometry(1, 8, 6),
  cargo: new THREE.BoxGeometry(
    ItemConfig.visualSize * 2,
    ItemConfig.stackGap * 0.9,
    ItemConfig.visualSize * 2,
  ),
};

// --- 공유 머티리얼(색 안 바뀌는 부위) ---
const MAT = {
  eye: new THREE.MeshStandardMaterial({ color: ArtConfig.chameleon.eye, roughness: 0.3 }),
  pupil: new THREE.MeshStandardMaterial({ color: ArtConfig.chameleon.pupil, roughness: 0.4 }),
  leg: new THREE.MeshStandardMaterial({ color: ArtConfig.chameleon.leg, roughness: 0.7 }),
  tail: new THREE.MeshStandardMaterial({ color: ArtConfig.chameleon.tail, roughness: 0.6 }),
  cargo: new THREE.MeshStandardMaterial({ color: 0xffcc44, roughness: 0.7 }),
};

export class MoverView {
  readonly group: THREE.Group;

  private readonly body: THREE.Mesh;
  private readonly bodyMat: THREE.MeshStandardMaterial;
  private readonly eyePivots: THREE.Group[] = [];
  private readonly stack: THREE.Group;
  private readonly boxes: THREE.Mesh[] = [];

  // 흔들림/플린치 트윈 상태
  private shakeEnergy = 0;
  private shakeTime = 0;
  private flinchEnergy = 0;

  // 색-상태 lerp (in-place, 재사용 Color)
  private readonly curColor: THREE.Color;
  private readonly curEmissive: THREE.Color;
  private readonly targetColor = new THREE.Color(ArtConfig.chameleon.bodyGreen);
  private readonly targetEmissive = new THREE.Color(ArtConfig.chameleon.emissiveGreen);

  private phase: RoundPhase = RoundPhase.GREEN;
  private eyeScale = ArtConfig.chameleon.eyeScaleCalm;

  private readonly shadows = ArtConfig.scene.shadows;

  constructor(private readonly mover: Mover) {
    this.group = new THREE.Group();
    const c = ArtConfig.chameleon;

    this.curColor = new THREE.Color(c.bodyGreen);
    this.curEmissive = new THREE.Color(c.emissiveGreen);

    // 몸통(둥근 egg 스케일).
    this.bodyMat = new THREE.MeshStandardMaterial({
      color: this.curColor.clone(),
      emissive: this.curEmissive.clone(),
      roughness: 0.55,
    });
    this.body = new THREE.Mesh(SHARED.body, this.bodyMat);
    this.body.scale.set(0.42, 0.4, 0.62);
    this.body.position.y = 0.42;
    this.setShadow(this.body);
    this.group.add(this.body);

    // 눈 2개(독립 구, 크게). 앞쪽(+z) 상단에 좌우로. 각 눈은 pivot(뱅글 회전용).
    for (const sx of [-1, 1]) {
      const pivot = new THREE.Group();
      pivot.position.set(sx * 0.2, 0.62, 0.34);

      const ball = new THREE.Mesh(SHARED.eye, MAT.eye);
      ball.scale.setScalar(0.17);
      this.setShadow(ball);
      pivot.add(ball);

      const pupil = new THREE.Mesh(SHARED.pupil, MAT.pupil);
      pupil.scale.setScalar(0.08);
      pupil.position.set(sx * 0.05, 0.02, 0.13);
      pivot.add(pupil);

      this.group.add(pivot);
      this.eyePivots.push(pivot);
    }

    // 짧은 다리 4개.
    const legY = 0.14;
    for (const [lx, lz] of [
      [-0.24, 0.3],
      [0.24, 0.3],
      [-0.24, -0.28],
      [0.24, -0.28],
    ] as const) {
      const leg = new THREE.Mesh(SHARED.leg, MAT.leg);
      leg.position.set(lx, legY, lz);
      leg.rotation.z = lx < 0 ? 0.3 : -0.3;
      this.setShadow(leg);
      this.group.add(leg);
    }

    // 돌돌 말린 꼬리(구 세그먼트 체인, 뒤로 갈수록 작아지며 위로 말림).
    const segs = 6;
    for (let i = 0; i < segs; i++) {
      const t = i / (segs - 1);
      const seg = new THREE.Mesh(SHARED.tail, MAT.tail);
      const r = 0.12 * (1 - t * 0.6);
      seg.scale.setScalar(r);
      // 뒤(-z)로 나가다 위로 말리는 근사 곡선.
      const angle = t * Math.PI * 1.4;
      seg.position.set(
        0,
        0.35 + Math.sin(angle) * 0.18 * t,
        -0.5 - Math.cos(angle) * 0.22 - t * 0.05,
      );
      this.setShadow(seg);
      this.group.add(seg);
    }

    // 짐 스택(등 위, 공유 지오/머티리얼).
    this.stack = new THREE.Group();
    this.stack.position.set(0, 0.72, -0.02);
    this.group.add(this.stack);
    for (let i = 0; i < ItemConfig.maxPerPlayer; i++) {
      const b = new THREE.Mesh(SHARED.cargo, MAT.cargo);
      b.position.y = i * ItemConfig.stackGap + ItemConfig.stackGap * 0.5;
      b.visible = false;
      this.setShadow(b);
      this.stack.add(b);
      this.boxes.push(b);
    }
  }

  private setShadow(m: THREE.Mesh): void {
    if (this.shadows) m.castShadow = true;
  }

  /** 페이즈에 따른 목표 색/눈크기 설정(탈락 시엔 update에서 우선 적용). */
  setPhase(phase: RoundPhase): void {
    this.phase = phase;
    const c = ArtConfig.chameleon;
    const danger = phase === RoundPhase.TELL || phase === RoundPhase.RED;
    this.targetColor.setHex(danger ? c.bodyRed : c.bodyGreen);
    this.targetEmissive.setHex(danger ? c.emissiveRed : c.emissiveGreen);
  }

  /** 낙하/급정지 흔들림 임펄스. */
  addShake(impulse: number): void {
    this.shakeEnergy = Math.min(1, this.shakeEnergy + impulse);
  }

  /** 낙하 시 카멜레온 움찔(스쿼시) 임펄스. */
  addFlinch(impulse: number): void {
    this.flinchEnergy = Math.min(1, this.flinchEnergy + impulse);
  }

  update(dt: number): void {
    const c = ArtConfig.chameleon;
    const caught = this.mover.status === MoverStatus.CAUGHT;

    // 위치 동기화(1D 트랙).
    this.group.position.x = this.mover.position.x;
    this.group.position.z = this.mover.position.z;

    // 진행 방향(+? 카멜레온이 앞을 보게) — 전진은 -z, 눈이 +z에 있으니 180도 돌려 정면 향하게.
    this.group.rotation.y = Math.PI;

    // --- 색-상태 lerp ---
    if (caught) {
      this.targetColor.setHex(c.bodyCaught);
      this.targetEmissive.setHex(c.emissiveCaught);
    } else if (this.mover.status === MoverStatus.FINISHED) {
      this.targetColor.setHex(c.bodyGreen);
      this.targetEmissive.setHex(c.emissiveGreen);
    }
    const t = Math.min(1, c.colorLerpSpeed * dt);
    this.curColor.lerp(this.targetColor, t);
    this.curEmissive.lerp(this.targetEmissive, t);
    this.bodyMat.color.copy(this.curColor);
    this.bodyMat.emissive.copy(this.curEmissive);

    // 빠름 모드는 살짝 채도 높은 느낌으로 emissive 가산(선택적, 가독성 보조).
    this.bodyMat.emissiveIntensity =
      this.mover.speedMode === SpeedMode.FAST && !caught ? 1.15 : 0.85;

    // --- 눈: RED/탈락에 크게, 탈락 시 뱅글 ---
    const alert = caught || this.phase === RoundPhase.RED;
    const targetEye = alert ? c.eyeScaleAlert : c.eyeScaleCalm;
    this.eyeScale += (targetEye - this.eyeScale) * t;
    for (let i = 0; i < this.eyePivots.length; i++) {
      const p = this.eyePivots[i];
      p.scale.setScalar(this.eyeScale);
      if (caught) {
        p.rotation.z += (i === 0 ? 1 : -1) * c.eyeSpinSpeed * dt;
      }
    }

    // --- 짐 개수 표시 ---
    for (let i = 0; i < this.boxes.length; i++) {
      this.boxes[i].visible = i < this.mover.cargo;
    }

    // --- 스택 흔들림(감쇠 사인, 스택 높을수록 크게) ---
    const cs = EffectConfig.cargoShake;
    if (this.shakeEnergy > 0) {
      this.shakeTime += dt;
      this.shakeEnergy = Math.max(0, this.shakeEnergy - cs.decayPerSec * dt);
      const amp =
        cs.maxLean + ArtConfig.stackShakePerBox * this.mover.cargo;
      const lean = Math.sin(this.shakeTime * cs.freq) * this.shakeEnergy * amp;
      this.stack.rotation.z = lean;
      this.stack.rotation.x = lean * 0.5;
    } else if (this.stack.rotation.z !== 0 || this.stack.rotation.x !== 0) {
      this.stack.rotation.z = 0;
      this.stack.rotation.x = 0;
    }

    // --- 플린치(몸통 스쿼시) ---
    if (this.flinchEnergy > 0) {
      this.flinchEnergy = Math.max(
        0,
        this.flinchEnergy - ArtConfig.flinch.decayPerSec * dt,
      );
      const s = this.flinchEnergy * ArtConfig.flinch.scale;
      this.body.scale.set(0.42 * (1 + s), 0.4 * (1 - s), 0.62 * (1 + s));
    } else {
      this.body.scale.set(0.42, 0.4, 0.62);
    }
  }
}
