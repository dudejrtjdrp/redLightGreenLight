/**
 * MoverView.ts
 * 무버 = 귀여운 로우폴리 카멜레온. Three.js 프리미티브 조합(외부 모델 없음).
 *
 * 성능:
 *  - 지오메트리는 모듈 스코프에서 공유(SHARED) → 무버 여러 명이어도 지오 재사용.
 *  - 색 바뀌는 몸통 머티리얼만 인스턴스별 소유. 나머지는 공유. 매 프레임 new 없음.
 *
 * 아트=가독성:
 *  - 색-상태: GREEN 초록 / TELL 초록→빨강 lerp / RED 빨강+눈 크게 / 탈락 굳음+눈 뱅글.
 *  - 스택 기울기: 데이터 mover.tilt 를 소스로(Phase 4 개정). 윗짐이 늦게 따라오는 채찍 효과.
 *  - 경고 플래시: mover:warned 때 흰색 순간 발광.
 */

import * as THREE from "three";
import { Mover, MoverStatus, SpeedMode } from "../gameplay/Mover";
import { RoundPhase } from "../gameplay/RoundState";
import { ItemConfig } from "../config/ItemConfig";
import { ArtConfig } from "../config/ArtConfig";

// --- 공유 지오메트리(로우폴리) ---
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

const BODY_SCALE = new THREE.Vector3(0.42, 0.4, 0.62);

export class MoverView {
  readonly group: THREE.Group;

  private readonly body: THREE.Mesh;
  private readonly bodyMat: THREE.MeshStandardMaterial;
  private readonly eyePivots: THREE.Group[] = [];
  private readonly stack: THREE.Group;
  private readonly boxes: THREE.Mesh[] = [];

  // 스택 시각 tilt(데이터 tilt를 lag로 따라감), 플린치, 경고 플래시
  private visTilt = 0;
  private flinchEnergy = 0;
  private flashEnergy = 0;

  // 색-상태 lerp (in-place)
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

    this.bodyMat = new THREE.MeshStandardMaterial({
      color: this.curColor.clone(),
      emissive: this.curEmissive.clone(),
      roughness: 0.55,
    });
    this.body = new THREE.Mesh(SHARED.body, this.bodyMat);
    this.body.scale.copy(BODY_SCALE);
    this.body.position.y = 0.42;
    this.setShadow(this.body);
    this.group.add(this.body);

    // 눈 2개(pivot으로 뱅글 회전).
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

    // 다리 4개.
    for (const [lx, lz] of [
      [-0.24, 0.3],
      [0.24, 0.3],
      [-0.24, -0.28],
      [0.24, -0.28],
    ] as const) {
      const leg = new THREE.Mesh(SHARED.leg, MAT.leg);
      leg.position.set(lx, 0.14, lz);
      leg.rotation.z = lx < 0 ? 0.3 : -0.3;
      this.setShadow(leg);
      this.group.add(leg);
    }

    // 말린 꼬리.
    const segs = 6;
    for (let i = 0; i < segs; i++) {
      const t = i / (segs - 1);
      const seg = new THREE.Mesh(SHARED.tail, MAT.tail);
      seg.scale.setScalar(0.12 * (1 - t * 0.6));
      const angle = t * Math.PI * 1.4;
      seg.position.set(
        0,
        0.35 + Math.sin(angle) * 0.18 * t,
        -0.5 - Math.cos(angle) * 0.22 - t * 0.05,
      );
      this.setShadow(seg);
      this.group.add(seg);
    }

    // 짐 스택.
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

  setPhase(phase: RoundPhase): void {
    this.phase = phase;
    const c = ArtConfig.chameleon;
    const danger = phase === RoundPhase.TELL || phase === RoundPhase.RED;
    this.targetColor.setHex(danger ? c.bodyRed : c.bodyGreen);
    this.targetEmissive.setHex(danger ? c.emissiveRed : c.emissiveGreen);
  }

  /** 낙하 시 몸통 움찔(스쿼시). */
  addFlinch(impulse: number): void {
    this.flinchEnergy = Math.min(1, this.flinchEnergy + impulse);
  }

  /** 경고 시 흰색 플래시. */
  flash(impulse: number): void {
    this.flashEnergy = Math.min(1, this.flashEnergy + impulse);
  }

  update(dt: number): void {
    const c = ArtConfig.chameleon;
    const caught = this.mover.status === MoverStatus.CAUGHT;

    // 위치 동기화 + 전진 방향(-z)을 향하도록 180도.
    this.group.position.x = this.mover.position.x;
    this.group.position.z = this.mover.position.z;
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

    // 경고 플래시(흰색 가산).
    if (this.flashEnergy > 0) {
      this.flashEnergy = Math.max(
        0,
        this.flashEnergy - ArtConfig.warnFlash.decayPerSec * dt,
      );
      this.bodyMat.emissive.addScalar(this.flashEnergy * ArtConfig.warnFlash.strength);
    }

    this.bodyMat.emissiveIntensity =
      this.mover.speedMode === SpeedMode.FAST && !caught ? 1.15 : 0.85;

    // --- 눈: RED/탈락 크게, 탈락 뱅글 ---
    const alert = caught || this.phase === RoundPhase.RED;
    const targetEye = alert ? c.eyeScaleAlert : c.eyeScaleCalm;
    this.eyeScale += (targetEye - this.eyeScale) * t;
    for (let i = 0; i < this.eyePivots.length; i++) {
      const p = this.eyePivots[i];
      p.scale.setScalar(this.eyeScale);
      if (caught) p.rotation.z += (i === 0 ? 1 : -1) * c.eyeSpinSpeed * dt;
    }

    // --- 짐 개수 표시 ---
    for (let i = 0; i < this.boxes.length; i++) {
      this.boxes[i].visible = i < this.mover.cargo;
    }

    // --- 스택 기울기: 데이터 tilt를 lag로 따라감 → 전단(shear)으로 표현 ---
    // 바닥 한 점 피벗 회전 금지. 높이 인덱스에 비례한 가로 오프셋으로 "위로 갈수록 밀림".
    const st = ArtConfig.stackTilt;
    this.visTilt += (this.mover.tilt - this.visTilt) * Math.min(1, st.follow * dt);
    this.stack.rotation.z = 0; // 회전 제거
    for (let i = 0; i < this.boxes.length; i++) {
      let x = this.visTilt * st.shearPerLevel * i; // i=바닥(0) → 안 밀림, 위일수록 큼
      if (x > st.maxShear) x = st.maxShear;
      else if (x < -st.maxShear) x = -st.maxShear;
      this.boxes[i].position.x = x;
    }

    // --- 플린치(몸통 스쿼시) ---
    if (this.flinchEnergy > 0) {
      this.flinchEnergy = Math.max(
        0,
        this.flinchEnergy - ArtConfig.flinch.decayPerSec * dt,
      );
      const s = this.flinchEnergy * ArtConfig.flinch.scale;
      this.body.scale.set(
        BODY_SCALE.x * (1 + s),
        BODY_SCALE.y * (1 - s),
        BODY_SCALE.z * (1 + s),
      );
    } else {
      this.body.scale.copy(BODY_SCALE);
    }
  }
}
