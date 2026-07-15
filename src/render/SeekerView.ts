/**
 * SeekerView.ts
 * 술래 시각 표현 + "무궁화꽃이 피었습니다" 회전 연출.
 *  - GREEN/RESOLVE/LOBBY: 등 돌림(무버 안 봄) → 무버 이동 허용 구간.
 *  - TELL: 돌아보는 중(0.8~1.2s 창을 시각적으로 명확히).
 *  - RED: 무버 정면 응시 → 이때 움직이면 탈락.
 * 회전은 목표 yaw로 등속 보간(개별 물리 없음).
 */

import * as THREE from "three";
import { RoundPhase } from "../gameplay/RoundState";
import { GameBalance } from "../config/GameBalance";
import { EffectConfig } from "../config/EffectConfig";

export class SeekerView {
  readonly group: THREE.Group;
  /** yaw 0 = 무버(+z) 응시, yaw PI = 등 돌림. */
  private yaw = Math.PI;
  private targetYaw = Math.PI;

  constructor() {
    this.group = new THREE.Group();

    const body = new THREE.Mesh(
      new THREE.CylinderGeometry(0.5, 0.62, 1.5, 14),
      new THREE.MeshStandardMaterial({ color: 0xd23b3b, roughness: 0.5 }),
    );
    body.position.y = 0.75;
    this.group.add(body);

    // 응시 방향을 알려주는 "코"(하양). +z 쪽에 붙어 yaw 0에서 무버를 향함.
    const nose = new THREE.Mesh(
      new THREE.BoxGeometry(0.22, 0.22, 0.5),
      new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4 }),
    );
    nose.position.set(0, 1.0, 0.5);
    this.group.add(nose);

    // 완주선 너머에 배치.
    const finishZ = GameBalance.track.startZ - GameBalance.track.length;
    this.group.position.set(0, 0, finishZ - 1.2);
    this.group.rotation.y = this.yaw;
  }

  /** 페이즈에 따라 응시 목표 갱신. */
  setPhase(phase: RoundPhase): void {
    const facing = phase === RoundPhase.TELL || phase === RoundPhase.RED;
    this.targetYaw = facing ? 0 : Math.PI;
  }

  update(dt: number): void {
    if (this.yaw === this.targetYaw) return;
    const rate = EffectConfig.seeker.turnSpeed * dt;
    let diff = this.targetYaw - this.yaw;
    while (diff > Math.PI) diff -= 2 * Math.PI;
    while (diff < -Math.PI) diff += 2 * Math.PI;
    const step = Math.sign(diff) * Math.min(Math.abs(diff), rate);
    this.yaw += step;
    // 목표 근접 시 스냅.
    if (Math.abs(this.targetYaw - this.yaw) < 1e-3) this.yaw = this.targetYaw;
    this.group.rotation.y = this.yaw;
  }
}
