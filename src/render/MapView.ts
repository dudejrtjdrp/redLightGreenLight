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

/** 시드 기반 PRNG(mulberry32) — 재현 가능한 배치. */
function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

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
    const bbox = new THREE.Box3().setFromObject(tile);
    const size = new THREE.Vector3();
    bbox.getSize(size);
    const stepZ = Math.max(size.z, 0.5);
    const roadHalfWidth = Math.max(size.x, 0.5) / 2; // 도로 절반폭(프롭 배치 경계)
    /**
     * 도로 "상판" 높이(스케일 반영). 타일을 이만큼 내려 상판이 정확히 groundY(=0)에 오게 한다.
     * (스케일 2.5 확대 후 상판이 y>0로 올라와 낙하 짐/완주선이 도로에 묻히던 문제의 근본 수정)
     */
    const surfaceY = Math.max(0, bbox.max.y);
    console.log(
      `[Map] 타일 실측 x=${size.x.toFixed(2)} z=${size.z.toFixed(2)} 상판y=${surfaceY.toFixed(2)}` +
        ` (tileYaw=${MapConfig.tileYaw.toFixed(2)}) → stepZ=${stepZ.toFixed(2)}`,
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
      clone.position.set(
        MapConfig.centerX,
        MapConfig.groundY - surfaceY, // 상판을 groundY에 정렬(짐/라인 매몰 방지)
        zHi - (i + 0.5) * stepZ,
      );
      makeStatic(clone);
      group.add(clone);
    }

    // --- 양옆 장식 ---
    if (MapConfig.decor.enabled) {
      const templates: THREE.Object3D[] = [];
      for (const p of MapConfig.decor.props) {
        try {
          const g = await loader.loadAsync(encodeURI(p));
          templates.push(g.scene); // 스케일은 배치 시 지정(이중 적용 방지)
        } catch (e) {
          console.warn("[Map] 장식 로드 실패(무시):", p, e);
        }
      }
      if (templates.length > 0) {
        const d = MapConfig.decor;
        const rng = makeRng(d.seed);
        const zRange = zHi - zLo;
        // 도로 밖(도로 절반폭 + edgeMargin 이후)에만 seeded random 흩뿌림.
        const minX = roadHalfWidth + d.edgeMargin;
        for (let k = 0; k < d.count; k++) {
          const t = templates[Math.floor(rng() * templates.length)].clone(true);
          const side = rng() < 0.5 ? -1 : 1;
          const x = side * (minX + rng() * d.spreadX);
          const z = zLo + rng() * zRange;
          const s = d.scale + (rng() * 2 - 1) * d.scaleJitter;
          t.position.set(x, MapConfig.groundY, z);
          t.rotation.y = rng() * Math.PI * 2;
          t.scale.setScalar(Math.max(0.4, s));
          makeStatic(t);
          group.add(t);
        }
        console.log(
          `[Map] 장식 ${d.count}개 배치(도로밖 |x|≥${minX.toFixed(1)}, seed ${d.seed})`,
        );
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
