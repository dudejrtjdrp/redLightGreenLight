/**
 * EffectSystem.ts
 * 낙하 연출(fake physics의 보이는 부분). 짐이 튀어오르다 떨어지는 조각을 표현.
 * 전부 Object Pool 경유 — item:dropped마다 조각 하나 acquire, 애니 종료 시 release.
 * 매 프레임 new 없음(GC 압박 방지).
 */

import * as THREE from "three";
import { ObjectPool } from "../core/ObjectPool";
import { gameBus } from "../core/EventBus";
import { EffectConfig } from "../config/EffectConfig";
// EventMap 선언 병합 로드 보장(item:dropped 타입).
import "../gameplay/GameplayEvents";

interface Puff {
  mesh: THREE.Mesh;
  vx: number;
  vy: number;
  vz: number;
  spin: number;
  t: number;
}

export class EffectSystem {
  readonly group: THREE.Group;
  private readonly pool: ObjectPool<Puff>;
  private readonly active: Puff[] = [];

  constructor() {
    this.group = new THREE.Group();
    const e = EffectConfig.dropEffect;
    const geo = new THREE.BoxGeometry(e.size, e.size, e.size);
    const mat = new THREE.MeshStandardMaterial({ color: 0xffaa33, roughness: 0.6 });

    this.pool = new ObjectPool<Puff>(
      () => {
        const mesh = new THREE.Mesh(geo, mat);
        mesh.visible = false;
        this.group.add(mesh);
        return { mesh, vx: 0, vy: 0, vz: 0, spin: 0, t: 0 };
      },
      (p) => {
        p.mesh.visible = false;
      },
      e.poolSize,
    );

    gameBus.on("item:dropped", this.onDropped);
  }

  private readonly onDropped = (payload: {
    position: { x: number; z: number };
  }): void => {
    const e = EffectConfig.dropEffect;
    const p = this.pool.acquire();
    p.t = 0;
    p.mesh.visible = true;
    p.mesh.position.set(payload.position.x, 0.5, payload.position.z);
    p.mesh.rotation.set(0, 0, 0);
    p.vx = (Math.random() - 0.5) * e.spread;
    p.vz = (Math.random() - 0.5) * e.spread;
    p.vy = e.hopUp;
    p.spin = (Math.random() - 0.5) * e.spin;
    this.active.push(p);
  };

  update(dt: number): void {
    const e = EffectConfig.dropEffect;
    for (let i = this.active.length - 1; i >= 0; i--) {
      const p = this.active[i];
      p.t += dt;
      p.vy -= e.gravity * dt;
      p.mesh.position.x += p.vx * dt;
      p.mesh.position.y += p.vy * dt;
      p.mesh.position.z += p.vz * dt;
      p.mesh.rotation.x += p.spin * dt;
      p.mesh.rotation.y += p.spin * dt;
      if (p.mesh.position.y <= 0.1 || p.t >= e.duration) {
        // 애니 종료 → 풀 반환.
        this.active.splice(i, 1);
        this.pool.release(p);
      }
    }
  }

  dispose(): void {
    gameBus.off("item:dropped", this.onDropped);
  }
}
