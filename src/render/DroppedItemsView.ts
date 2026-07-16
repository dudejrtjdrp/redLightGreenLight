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
    // 트랙 잔류 짐 = 들고 있던 짐과 동일한 박스(크기/색 통일 → "짐이 떨어졌다"가 즉시 읽힘).
    const s = ItemConfig.visualScale;
    const geo = new THREE.BoxGeometry(
      ItemConfig.visualSize * 2 * s,
      ItemConfig.stackGap * 0.9 * s,
      ItemConfig.visualSize * 2 * s,
    );
    const mat = new THREE.MeshStandardMaterial({
      color: 0xffcc44,
      roughness: 0.8,
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
        // 바닥(y=0, 도로 상판)에 밑면이 닿게: y = 박스 높이/2.
        m.position.set(
          item.position.x,
          (ItemConfig.stackGap * 0.9 * ItemConfig.visualScale) / 2 + 0.01,
          item.position.z,
        );
      } else if (m.visible) {
        m.visible = false;
      }
    }
  }
}
