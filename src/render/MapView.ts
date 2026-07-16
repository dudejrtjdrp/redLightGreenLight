/**
 * MapView.ts (Phase 8: 맵 도로 + 양옆 장식)
 * 모듈러 도로 타일 1종을 논리 트랙(GameBalance.track, 0 → -trackLength)을 따라 세로로 반복 배치하고,
 * 도로 양옆에 가로등/나무/덤불을 배치한다. 시각 전용(물리 없음). 논리 좌표가 정답 — 맵을 좌표에 맞춘다.
 *
 * 방향: 정사각 타일은 bbox 자동판별이 틀리므로 MapConfig.tileYaw로 명시(기본 0=세로).
 * 성능(정적): 클론은 지오/머티리얼 참조 공유, matrixAutoUpdate=false, 그림자 receive만(cast X),
 *   프러스텀 컬링 유지, 매 프레임 갱신 없음. 로드 실패 시 null → 바닥 플레이스홀더 폴백. dispose 지원.
 */

import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { GameBalance } from "../config/GameBalance";
import { MapConfig } from "../config/MapConfig";

function makeStatic(obj: THREE.Object3D): void {
  obj.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) {
      m.castShadow = false;
      m.receiveShadow = true;
    }
    o.matrixAutoUpdate = false;
    o.updateMatrix();
  });
  obj.matrixAutoUpdate = false;
  obj.updateMatrix();
}

export class MapView {
  readonly group: THREE.Group;
  private constructor(group: THREE.Group) {
    this.group = group;
  }

  static async create(scene: THREE.Scene): Promise<MapView | null> {
    if (!MapConfig.enabled) return null;
    const loader = new GLTFLoader();

    // --- 도로 타일 ---
    let gltf;
    const url = encodeURI(MapConfig.roadTile);
    try {
      console.log("[Map] 도로 타일 로드 시도:", url);
      gltf = await loader.loadAsync(url);
    } catch (e) {
      console.warn("[Map] 도로 로드 실패 → 바닥 플레이스홀더 유지:", url, e);
      return null;
    }

    const tile = gltf.scene;
    tile.scale.setScalar(MapConfig.scale);
    tile.rotation.y = MapConfig.tileYaw; // 방향 명시
    tile.updateWorldMatrix(true, true);

    // 회전 반영된 실측으로 z 스텝(하드코딩 금지).
    const size = new THREE.Vector3();
    new THREE.Box3().setFromObject(tile).getSize(size);
    const stepZ = Math.max(size.z, 0.5);
    console.log(
      `[Map] 타일 실측 x=${size.x.toFixed(2)} z=${size.z.toFixed(2)} (tileYaw=${MapConfig.tileYaw.toFixed(2)}) → stepZ=${stepZ.toFixed(2)}`,
    );

    const startZ = GameBalance.track.startZ;
    const finishZ = startZ - GameBalance.track.length;
    const zHi = startZ + MapConfig.padStartTiles * stepZ;
    const zLo = finishZ - MapConfig.padEndTiles * stepZ;
    const count = Math.max(1, Math.ceil((zHi - zLo) / stepZ));

    const group = new THREE.Group();
    group.rotation.y = MapConfig.yawOffset;

    for (let i = 0; i < count; i++) {
      const clone = tile.clone(true);
      clone.position.set(MapConfig.centerX, MapConfig.groundY, zHi - (i + 0.5) * stepZ);
      makeStatic(clone);
      group.add(clone);
    }

    // --- 양옆 장식 ---
    if (MapConfig.decor.enabled) {
      const templates: THREE.Object3D[] = [];
      for (const p of MapConfig.decor.props) {
        try {
          const g = await loader.loadAsync(encodeURI(p));
          const t = g.scene;
          t.scale.setScalar(MapConfig.decor.scale);
          templates.push(t);
        } catch (e) {
          console.warn("[Map] 장식 로드 실패(무시):", p, e);
        }
      }
      if (templates.length > 0) {
        let idx = 0;
        for (let z = zHi; z >= zLo; z -= MapConfig.decor.spacing) {
          for (const side of [-1, 1] as const) {
            const t = templates[idx % templates.length].clone(true);
            t.position.set(side * MapConfig.decor.sideOffsetX, MapConfig.groundY, z);
            t.rotation.y = side > 0 ? 0 : Math.PI; // 도로 쪽을 바라보게
            makeStatic(t);
            group.add(t);
            idx++;
          }
        }
        // 배경 깊이용 먼 나무열(더 넓은 간격).
        if (MapConfig.decor.farOffsetX > 0) {
          for (let z = zHi; z >= zLo; z -= MapConfig.decor.spacing * 1.7) {
            for (const side of [-1, 1] as const) {
              const t = templates[idx % templates.length].clone(true);
              t.position.set(side * MapConfig.decor.farOffsetX, MapConfig.groundY, z);
              t.rotation.y = side > 0 ? 0 : Math.PI;
              makeStatic(t);
              group.add(t);
              idx++;
            }
          }
        }
        console.log(`[Map] 장식 ${templates.length}종 배치(근/원 양옆), 간격 ${MapConfig.decor.spacing}`);
      }
    }

    group.matrixAutoUpdate = false;
    group.updateMatrix();
    scene.add(group);

    if (MapConfig.hideGrid) {
      scene.traverse((o) => {
        if (o instanceof THREE.GridHelper) o.visible = false;
      });
    }

    console.log(`[Map] 도로 ${count}타일 배치 완료 (z ${zHi.toFixed(1)} → ${zLo.toFixed(1)})`);
    return new MapView(group);
  }

  dispose(): void {
    this.group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      m.geometry?.dispose();
      const mat = m.material;
      const mats = Array.isArray(mat) ? mat : [mat];
      for (const mm of mats) {
        const sm = mm as THREE.MeshStandardMaterial;
        sm.map?.dispose();
        sm.dispose();
      }
    });
    this.group.removeFromParent();
  }
}
