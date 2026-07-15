/**
 * EffectSystem.ts
 * 낙하 아크 연출: 짐이 손/스택(from)에서 이탈해 포물선으로 착지(to)까지 날아가는 애니메이션.
 * item:dropped(분리 시점)마다 풀에서 조각 하나 acquire, 착지(t≥1) 시 release.
 * 매 프레임 new 없음(GC 압박 방지). 착지 타이밍은 CargoSystem의 회수 전환과 duration 공유.
 */

import * as THREE from "three";
import { ObjectPool } from "../core/ObjectPool";
import { gameBus } from "../core/EventBus";
import { EffectConfig } from "../config/EffectConfig";
// EventMap 선언 병합 로드 보장(item:dropped 타입).
import "../gameplay/GameplayEvents";

interface Flight {
  mesh: THREE.Mesh;
  fx: number;
  fy: number;
  fz: number;
  tx: number;
  ty: number;
  tz: number;
  t: number;
  dur: number;
}

export class EffectSystem {
  readonly group: THREE.Group;
  private readonly pool: ObjectPool<Flight>;
  private readonly active: Flight[] = [];

  constructor() {
    this.group = new THREE.Group();
    const e = EffectConfig.dropFlight;
    const geo = new THREE.BoxGeometry(e.size, e.size, e.size);
    const mat = new THREE.MeshStandardMaterial({ color: 0xffb733, roughness: 0.7 });

    this.pool = new ObjectPool<Flight>(
      () => {
        const mesh = new THREE.Mesh(geo, mat);
        mesh.visible = false;
        this.group.add(mesh);
        return { mesh, fx: 0, fy: 0, fz: 0, tx: 0, ty: 0, tz: 0, t: 0, dur: 1 };
      },
      (f) => {
        f.mesh.visible = false;
      },
      e.poolSize,
    );

    gameBus.on("item:dropped", this.onDropped);
  }

  private readonly onDropped = (payload: {
    from: { x: number; y: number; z: number };
    to: { x: number; y: number; z: number };
  }): void => {
    const f = this.pool.acquire();
    f.t = 0;
    f.dur = EffectConfig.dropFlight.duration;
    f.fx = payload.from.x;
    f.fy = payload.from.y;
    f.fz = payload.from.z;
    f.tx = payload.to.x;
    f.ty = payload.to.y;
    f.tz = payload.to.z;
    f.mesh.visible = true;
    f.mesh.position.set(f.fx, f.fy, f.fz);
    f.mesh.rotation.set(0, 0, 0);
    this.active.push(f);
  };

  update(dt: number): void {
    const arc = EffectConfig.dropFlight.arcHeight;
    const tumble = EffectConfig.dropFlight.tumble;
    for (let i = this.active.length - 1; i >= 0; i--) {
      const f = this.active[i];
      f.t += dt;
      let k = f.t / f.dur;
      if (k > 1) k = 1;
      // 수평 선형 보간 + 포물선(y) — 바닥 피벗 회전 없이 옆으로 밀려나며 낙하.
      const x = f.fx + (f.tx - f.fx) * k;
      const z = f.fz + (f.tz - f.fz) * k;
      const yLin = f.fy + (f.ty - f.fy) * k;
      const y = yLin + Math.sin(Math.PI * k) * arc;
      f.mesh.position.set(x, y, z);
      f.mesh.rotation.x += tumble * dt;
      f.mesh.rotation.z += tumble * 0.6 * dt;
      if (k >= 1) {
        this.active.splice(i, 1);
        this.pool.release(f);
      }
    }
  }

  dispose(): void {
    gameBus.off("item:dropped", this.onDropped);
  }
}
