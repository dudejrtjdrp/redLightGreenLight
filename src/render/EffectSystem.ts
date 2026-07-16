/**
 * EffectSystem.ts
 * 낙하 연속 애니메이션(중력 적분). 짐이 손/스택(from, 실제 top-box 월드좌표)에서 이탈해
 * 매 프레임 중력으로 착지(to)까지 "끊김 없이" 떨어진다. GameRenderer가 spawn()으로 구동.
 *   vx,vz: 착지 지점 방향 수평 속도 유지 / vy: 중력 적분.
 * 착지(y ≤ 착지 높이 또는 안전 타임아웃) 시 item:landed emit → CargoSystem이 회수 가능 전환.
 * 매 프레임 new 없음. Pool 사용.
 */

import * as THREE from "three";
import { ObjectPool } from "../core/ObjectPool";
import { gameBus } from "../core/EventBus";
import { EffectConfig } from "../config/EffectConfig";
import { ItemConfig } from "../config/ItemConfig";
import "../gameplay/GameplayEvents";

interface Vec3Like {
  x: number;
  y: number;
  z: number;
}

interface Flight {
  mesh: THREE.Mesh;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  groundY: number;
  spin: number;
  t: number;
  itemId: number;
}

export class EffectSystem {
  readonly group: THREE.Group;
  private readonly pool: ObjectPool<Flight>;
  private readonly active: Flight[] = [];

  constructor() {
    this.group = new THREE.Group();
    const e = EffectConfig.dropFlight;
    // 낙하 중에도 "들고 있던 짐과 동일한 박스"가 떨어져야 한다(작은 정육면체 X).
    const s = ItemConfig.visualScale;
    const geo = new THREE.BoxGeometry(
      ItemConfig.visualSize * 2 * s,
      ItemConfig.stackGap * 0.9 * s,
      ItemConfig.visualSize * 2 * s,
    );
    const mat = new THREE.MeshStandardMaterial({ color: 0xffcc44, roughness: 0.7 });

    this.pool = new ObjectPool<Flight>(
      () => {
        const mesh = new THREE.Mesh(geo, mat);
        mesh.visible = false;
        this.group.add(mesh);
        return {
          mesh, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0,
          groundY: 0, spin: 0, t: 0, itemId: -1,
        };
      },
      (f) => {
        f.mesh.visible = false;
      },
      e.poolSize,
    );
  }

  /**
   * 낙하 시작: from(실제 이탈 월드좌표) → to(착지). 중력 낙하로 연속 이동.
   * 수평 속도는 착지점까지의 자유낙하 시간 T 기준으로 맞춰 to에 정확히 안착.
   */
  spawn(from: Vec3Like, to: Vec3Like, itemId: number): void {
    const e = EffectConfig.dropFlight;
    const f = this.pool.acquire();
    const dh = Math.max(0.001, from.y - to.y);
    const T = Math.sqrt((2 * dh) / e.gravity); // 자유낙하(vy0=0) 시간
    f.x = from.x;
    f.y = from.y;
    f.z = from.z;
    f.vx = (to.x - from.x) / T; // 수평은 등속(쏠린 방향 유지)
    f.vz = (to.z - from.z) / T;
    f.vy = 0;
    f.groundY = to.y;
    f.spin = (Math.random() < 0.5 ? -1 : 1) * e.spin;
    f.t = 0;
    f.itemId = itemId;
    f.mesh.visible = true;
    f.mesh.position.set(f.x, f.y, f.z);
    f.mesh.rotation.set(0, 0, 0);
    this.active.push(f);
  }

  update(dt: number): void {
    const e = EffectConfig.dropFlight;
    for (let i = this.active.length - 1; i >= 0; i--) {
      const f = this.active[i];
      f.t += dt;
      f.vy -= e.gravity * dt;
      f.x += f.vx * dt;
      f.y += f.vy * dt;
      f.z += f.vz * dt;
      f.mesh.position.set(f.x, f.y, f.z);
      f.mesh.rotation.x += f.spin * dt;
      f.mesh.rotation.z += f.spin * 0.6 * dt;

      if (f.y <= f.groundY || f.t >= e.safety) {
        f.mesh.position.y = f.groundY;
        gameBus.emit("item:landed", { itemId: f.itemId }); // 착지 → 회수 전환
        this.active.splice(i, 1);
        this.pool.release(f);
      }
    }
  }

  dispose(): void {
    this.active.length = 0;
  }
}
