/**
 * MoverView.ts
 * 무버 1명의 시각 표현: 몸통 큐브 + 등에 쌓인 짐 스택.
 * 짐 스택 흔들림은 개별 강체 없이 "감쇠 사인 트윈"으로만 표현(fake physics의 보이는 부분).
 * 메쉬/지오/머티리얼은 생성자에서 1회 생성 후 재사용(매 프레임 new 없음).
 */

import * as THREE from "three";
import { Mover, MoverStatus, SpeedMode } from "../gameplay/Mover";
import { PlayerConfig } from "../config/PlayerConfig";
import { ItemConfig } from "../config/ItemConfig";
import { EffectConfig } from "../config/EffectConfig";

export class MoverView {
  readonly group: THREE.Group;
  private readonly body: THREE.Mesh;
  private readonly bodyMat: THREE.MeshStandardMaterial;
  private readonly stack: THREE.Group;
  private readonly boxes: THREE.Mesh[] = [];

  private shakeEnergy = 0;
  private shakeTime = 0;

  constructor(private readonly mover: Mover) {
    this.group = new THREE.Group();

    const r = PlayerConfig.radius;
    this.bodyMat = new THREE.MeshStandardMaterial({
      color: 0x4aa3ff,
      roughness: 0.6,
    });
    this.body = new THREE.Mesh(new THREE.BoxGeometry(r * 2, 0.8, r * 2), this.bodyMat);
    this.body.position.y = 0.4;
    this.group.add(this.body);

    // 짐 스택(공유 지오/머티리얼).
    this.stack = new THREE.Group();
    this.stack.position.y = 0.8;
    this.group.add(this.stack);

    const boxGeo = new THREE.BoxGeometry(
      ItemConfig.visualSize * 2,
      ItemConfig.stackGap * 0.9,
      ItemConfig.visualSize * 2,
    );
    const boxMat = new THREE.MeshStandardMaterial({
      color: 0xffcc44,
      roughness: 0.7,
    });
    for (let i = 0; i < ItemConfig.maxPerPlayer; i++) {
      const b = new THREE.Mesh(boxGeo, boxMat);
      b.position.y = i * ItemConfig.stackGap + ItemConfig.stackGap * 0.5;
      b.visible = false;
      this.stack.add(b);
      this.boxes.push(b);
    }
  }

  /** 흔들림 임펄스 추가(정지/급정지/낙하 시 GameRenderer가 호출). */
  addShake(impulse: number): void {
    this.shakeEnergy = Math.min(1, this.shakeEnergy + impulse);
  }

  /** 데이터 → 메쉬 동기화 + 흔들림 트윈 감쇠. */
  update(dt: number): void {
    // 위치 동기화(1D 트랙: x 고정, z 반영).
    this.group.position.x = this.mover.position.x;
    this.group.position.z = this.mover.position.z;

    // 몸통 색: 탈락=회색, 아니면 모드색(빠름=적, 신중=청).
    if (this.mover.status === MoverStatus.CAUGHT) {
      this.bodyMat.color.setHex(0x888888);
    } else if (this.mover.status === MoverStatus.FINISHED) {
      this.bodyMat.color.setHex(0x9fe870);
    } else {
      this.bodyMat.color.setHex(
        this.mover.speedMode === SpeedMode.FAST ? 0xff5a4a : 0x4aa3ff,
      );
    }

    // 짐 개수만큼만 표시.
    for (let i = 0; i < this.boxes.length; i++) {
      this.boxes[i].visible = i < this.mover.cargo;
    }

    // 흔들림 감쇠(감쇠 사인). 개별 강체 없음.
    const cs = EffectConfig.cargoShake;
    if (this.shakeEnergy > 0) {
      this.shakeTime += dt;
      this.shakeEnergy = Math.max(0, this.shakeEnergy - cs.decayPerSec * dt);
      const lean = Math.sin(this.shakeTime * cs.freq) * this.shakeEnergy * cs.maxLean;
      this.stack.rotation.z = lean;
      this.stack.rotation.x = lean * 0.5;
    } else if (this.stack.rotation.z !== 0 || this.stack.rotation.x !== 0) {
      this.stack.rotation.z = 0;
      this.stack.rotation.x = 0;
    }
  }
}
