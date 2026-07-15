/**
 * DroppedItemsView.ts
 * 트랙 위 낙하물 표시. 고정 크기 메쉬 풀을 미리 생성하고 데이터에 맞춰 표시/숨김만 토글.
 * 매 프레임 생성 없음. 풀 크기 초과분은 표시 생략(로직상 짐은 유한하므로 실사용상 충분).
 */

import * as THREE from "three";
import { CargoSystem } from "../gameplay/CargoSystem";
import { EffectConfig } from "../config/EffectConfig";
import { ItemConfig } from "../config/ItemConfig";

export class DroppedItemsView {
  readonly group: THREE.Group;
  private readonly meshes: THREE.Mesh[] = [];

  constructor(private readonly cargo: CargoSystem) {
    this.group = new THREE.Group();
    const geo = new THREE.BoxGeometry(
      ItemConfig.visualSize * 2,
      ItemConfig.visualSize * 1.4,
      ItemConfig.visualSize * 2,
    );
    const mat = new THREE.MeshStandardMaterial({
      color: 0xbb8822,
      roughness: 0.9,
    });
    for (let i = 0; i < EffectConfig.droppedPoolSize; i++) {
      const m = new THREE.Mesh(geo, mat);
      m.visible = false;
      this.group.add(m);
      this.meshes.push(m);
    }
  }

  update(): void {
    const items = this.cargo.droppedItems;
    const n = this.meshes.length;
    for (let i = 0; i < n; i++) {
      const m = this.meshes[i];
      const item = i < items.length ? items[i] : undefined;
      if (item && item.position) {
        m.visible = true;
        m.position.set(
          item.position.x,
          ItemConfig.visualSize * 0.7,
          item.position.z,
        );
      } else if (m.visible) {
        m.visible = false;
      }
    }
  }
}
