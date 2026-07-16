/**
 * CharacterView.ts (Phase 8 실행: KayKit glb 아바타)
 * 절차적 캐릭터(MoverView)와 동일 API로 교체 가능한 glb 기반 아바타.
 *   group / setPhase / addFlinch / flash / getBoxWorldPosition / update / dispose
 *
 * - GLTFLoader로 캐릭터 + 애니 glb 로드(Draco/KTX2 아님 → 기본 로더).
 * - AnimationMixer로 Walk/Idle 크로스페이드. Walk timeScale = 이동속도/refSpeed(시간 아님).
 * - 기존 tilt/짐 스택/색상태는 그대로: 스택은 tilt로 수평 전단, 몸통도 tilt에 살짝 기울임.
 * - 로드 실패 시 create()가 null → 호출측이 절차적 캐릭터로 폴백.
 * - 매 프레임 new 없음. dispose에서 geometry/material/텍스처 정리.
 */

import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { Mover, MoverStatus } from "../gameplay/Mover";
import { RoundPhase } from "../gameplay/RoundState";
import { ItemConfig } from "../config/ItemConfig";
import { ArtConfig } from "../config/ArtConfig";
import { VisualConfig } from "../config/VisualConfig";
import { AssetConfig } from "../config/AssetConfig";

const CARGO_S = ItemConfig.visualScale;
const CARGO_GEO = new THREE.BoxGeometry(
  ItemConfig.visualSize * 2 * CARGO_S,
  ItemConfig.stackGap * 0.9 * CARGO_S,
  ItemConfig.visualSize * 2 * CARGO_S,
);
const CARGO_MAT = new THREE.MeshStandardMaterial({ color: 0xffcc44, roughness: 0.7 });

function findClip(
  clips: THREE.AnimationClip[],
  candidates: readonly string[],
): THREE.AnimationClip | null {
  for (const cand of candidates) {
    const c = cand.toLowerCase();
    const hit = clips.find((a) => a.name.toLowerCase().includes(c));
    if (hit) return hit;
  }
  return null;
}

export class CharacterView {
  readonly group: THREE.Group;

  private readonly leanNode: THREE.Group; // 수평 이동(무게중심)
  private readonly pivotNode: THREE.Group; // 잔여 회전(허리 높이 축)
  private readonly contentNode: THREE.Group; // 모델 + 스택
  private root!: THREE.Object3D; // glb 모델 루트(이동방향 조향용)
  private readonly mixer: THREE.AnimationMixer;
  private readonly walkAction: THREE.AnimationAction | null;
  private readonly idleAction: THREE.AnimationAction | null;
  private currentAction: THREE.AnimationAction | null = null;

  private readonly stack: THREE.Group;
  private readonly boxes: THREE.Mesh[] = [];
  private readonly materials: THREE.MeshStandardMaterial[] = [];

  private visTilt = 0;
  private bodyVisTilt = 0; // 몸 lean용 저역통과
  private animTime = 0;
  private flinchEnergy = 0;
  private flashEnergy = 0;
  private steerYaw = 0; // 이동방향 조향(정면 대비)
  private prevX = 0;
  private prevZ = 0;

  private readonly curEmissive: THREE.Color;
  private readonly targetEmissive: THREE.Color;
  private readonly shadows: boolean;

  /** 로드 + 구성. 실패하면 null(폴백). modelPath 미지정 시 기본 플레이어 모델. */
  static async create(
    mover: Mover,
    shadows: boolean,
    modelPath?: string,
  ): Promise<CharacterView | null> {
    if (!AssetConfig.enabled) return null;
    const loader = new GLTFLoader();

    let charGltf;
    const charUrl = modelPath ?? AssetConfig.player.path;
    try {
      console.log("[KayKit] 캐릭터 로드 시도:", charUrl);
      charGltf = await loader.loadAsync(charUrl);
    } catch (e) {
      console.warn("[KayKit] 캐릭터 로드 실패 → 절차적 폴백:", charUrl, e);
      return null;
    }

    const clips: THREE.AnimationClip[] = [...charGltf.animations];
    console.log(
      "[KayKit] 캐릭터 내장 클립:",
      charGltf.animations.map((a) => a.name),
    );
    for (const url of AssetConfig.animations) {
      try {
        const g = await loader.loadAsync(url);
        clips.push(...g.animations);
        console.log(`[KayKit] 애니 클립(${url}):`, g.animations.map((a) => a.name));
      } catch (e) {
        console.warn("[KayKit] 애니 glb 로드 실패(무시):", url, e);
      }
    }
    if (clips.length === 0) {
      console.warn("[KayKit] 클립 0개 → 절차적 폴백");
      return null;
    }

    return new CharacterView(mover, charGltf.scene, clips, shadows);
  }

  private constructor(
    private readonly mover: Mover,
    root: THREE.Object3D,
    clips: THREE.AnimationClip[],
    shadows: boolean,
  ) {
    this.shadows = shadows;
    this.group = new THREE.Group();
    // 정면 -Z + 모델 정면 보정.
    this.group.rotation.y = Math.PI + AssetConfig.player.yawOffset;

    // 계층: group → leanNode(수평이동) → pivotNode(허리축 회전) → contentNode(모델+스택).
    //  발밑(y=0)이 아니라 허리 높이를 축으로 소량 회전 + 주로 수평 이동 → base가 호를 안 그림.
    this.leanNode = new THREE.Group();
    this.group.add(this.leanNode);
    this.pivotNode = new THREE.Group();
    this.pivotNode.position.y = AssetConfig.bodyLeanPivotHeight;
    this.leanNode.add(this.pivotNode);
    this.contentNode = new THREE.Group();
    this.contentNode.position.y = -AssetConfig.bodyLeanPivotHeight;
    this.pivotNode.add(this.contentNode);

    root.scale.setScalar(AssetConfig.player.scale);
    this.root = root;
    this.contentNode.add(root);
    this.prevX = mover.position.x;
    this.prevZ = mover.position.z;

    // 그림자 + 틴트 대상 머티리얼 수집(인스턴스별 클론).
    root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      if (this.shadows) m.castShadow = true;
      const mat = m.material;
      const mats = Array.isArray(mat) ? mat : [mat];
      m.material = mats.map((mm) => {
        const c = (mm as THREE.Material).clone() as THREE.MeshStandardMaterial;
        if ((c as THREE.MeshStandardMaterial).emissive) this.materials.push(c);
        return c;
      });
      if (!Array.isArray(mat)) m.material = (m.material as THREE.Material[])[0];
    });

    // 손 본 탐색(정보 로그용). 기본은 안정적인 앵커에 스택을 얹는다.
    let handBone: THREE.Object3D | null = null;
    root.traverse((o) => {
      if (handBone) return;
      const n = o.name.toLowerCase();
      if (AssetConfig.handBoneCandidates.some((h) => n.includes(h))) handBone = o;
    });
    console.log(
      "[KayKit] 손 본:",
      handBone ? (handBone as THREE.Object3D).name : "없음(앵커에 스택 부착)",
    );

    // 애니 믹서 + 클립.
    this.mixer = new THREE.AnimationMixer(root);
    const walkClip = findClip(clips, AssetConfig.clips.walk);
    const idleClip = findClip(clips, AssetConfig.clips.idle);
    console.log(
      "[KayKit] 선택된 클립 → walk:",
      walkClip?.name ?? "(없음)",
      "idle:",
      idleClip?.name ?? "(없음)",
    );
    this.walkAction = walkClip ? this.mixer.clipAction(walkClip) : null;
    this.idleAction = idleClip ? this.mixer.clipAction(idleClip) : null;
    // idle 우선 시작(없으면 walk).
    const start = this.idleAction ?? this.walkAction;
    if (start) {
      start.play();
      this.currentAction = start;
    }

    // 색-상태 emissive 틴트.
    const h = VisualConfig.humanoid;
    this.curEmissive = new THREE.Color(h.emissiveGreen);
    this.targetEmissive = new THREE.Color(h.emissiveGreen);

    // 짐 스택(캐릭터 로컬 앵커, tiltPivot 자식 → 몸통과 함께 기울고 shear).
    this.stack = new THREE.Group();
    const a = AssetConfig.stackAnchor;
    this.stack.position.set(a.x, a.y, a.z);
    this.contentNode.add(this.stack);
    for (let i = 0; i < ItemConfig.maxPerPlayer; i++) {
      const b = new THREE.Mesh(CARGO_GEO, CARGO_MAT);
      b.position.y = (i * ItemConfig.stackGap + ItemConfig.stackGap * 0.5) * CARGO_S;
      b.visible = false;
      if (this.shadows) b.castShadow = true;
      this.stack.add(b);
      this.boxes.push(b);
    }
  }

  setPhase(phase: RoundPhase): void {
    const h = VisualConfig.humanoid;
    const danger = phase === RoundPhase.TELL || phase === RoundPhase.RED;
    this.targetEmissive.setHex(danger ? h.emissiveRed : h.emissiveGreen);
  }

  addFlinch(impulse: number): void {
    this.flinchEnergy = Math.min(1, this.flinchEnergy + impulse);
  }
  flash(impulse: number): void {
    this.flashEnergy = Math.min(1, this.flashEnergy + impulse);
  }

  getBoxWorldPosition(index: number, out: THREE.Vector3): THREE.Vector3 {
    const i = Math.max(0, Math.min(this.boxes.length - 1, index));
    return this.boxes[i].getWorldPosition(out);
  }

  update(dt: number): void {
    const caught = this.mover.status === MoverStatus.CAUGHT;
    this.animTime += dt;

    // 위치.
    this.group.position.x = this.mover.position.x;
    this.group.position.z = this.mover.position.z;

    // 이동속도(전진+횡, 줄서기 march 포함) → walk/idle + timeScale.
    const fwd = Math.hypot(this.mover.velocity.x, this.mover.velocity.z);
    const w = AssetConfig.walk;
    const moving = fwd > w.moveEps;
    this.setAction(moving ? this.walkAction : this.idleAction);
    if (this.walkAction) {
      let ts = fwd / w.refSpeed;
      if (ts < w.timeScaleMin) ts = w.timeScaleMin;
      else if (ts > w.timeScaleMax) ts = w.timeScaleMax;
      this.walkAction.timeScale = ts;
    }
    this.mixer.update(dt);

    // 이동 방향 바라보기(3인칭 게임식): 이동 헤딩 전체로 모델(root)만 부드럽게 회전.
    //  group(rotation.y=π)은 tilt/스택/낙하 프레임이라 불변 → root 회전은 이 프레임을 상쇄해
    //  월드 헤딩을 그대로 향하게. (KayKit 모델 +Z정면 가정; 반대면 face.modelYawOffset=π)
    const dx = this.mover.position.x - this.prevX;
    const dz = this.mover.position.z - this.prevZ;
    this.prevX = this.mover.position.x;
    this.prevZ = this.mover.position.z;
    const f = AssetConfig.face;
    if (dx * dx + dz * dz > f.moveEps * f.moveEps) {
      // 월드 이동 헤딩 → group(π) 상쇄 → 모델 로컬 yaw.
      const target = Math.atan2(dx, dz) - Math.PI + f.modelYawOffset;
      // 최단 경로 각도 보간(완전 회전, 클램프 없음).
      let diff = target - this.steerYaw;
      diff = ((diff + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
      this.steerYaw += diff * Math.min(1, f.turnSpeed * dt);
    }
    this.root.rotation.y = this.steerYaw;

    // 몸 tilt 표현 = 수평 이동(무게중심) + 소량 잔여 회전. 시각 tilt는 저역통과(덜덜 방지).
    this.bodyVisTilt +=
      (this.mover.tilt - this.bodyVisTilt) * Math.min(1, AssetConfig.bodyLeanFollow * dt);
    let offX = -this.bodyVisTilt * AssetConfig.bodyLeanScale;
    const om = AssetConfig.bodyLeanMax;
    if (offX > om) offX = om;
    else if (offX < -om) offX = -om;
    this.leanNode.position.x = offX;

    let rot = this.bodyVisTilt * AssetConfig.bodyLeanRotate;
    const rm = AssetConfig.bodyLeanRotateMax;
    if (rot > rm) rot = rm;
    else if (rot < -rm) rot = -rm;
    this.pivotNode.rotation.z = rot;

    // 플린치(스쿼시).
    if (this.flinchEnergy > 0) {
      this.flinchEnergy = Math.max(0, this.flinchEnergy - ArtConfig.flinch.decayPerSec * dt);
      const s = this.flinchEnergy * ArtConfig.flinch.scale;
      this.contentNode.scale.set(1 + s, 1 - s, 1 + s);
    } else {
      this.contentNode.scale.set(1, 1, 1);
    }

    // 색-상태 emissive 틴트(+경고 플래시).
    if (caught) this.targetEmissive.setHex(VisualConfig.humanoid.emissiveCaught);
    const t = Math.min(1, VisualConfig.humanoid.colorLerpSpeed * dt);
    this.curEmissive.lerp(this.targetEmissive, t);
    if (this.flashEnergy > 0) {
      this.flashEnergy = Math.max(0, this.flashEnergy - ArtConfig.warnFlash.decayPerSec * dt);
    }
    const danger = this.mover.inDanger && !caught;
    for (let i = 0; i < this.materials.length; i++) {
      const mat = this.materials[i];
      mat.emissive.copy(this.curEmissive);
      if (this.flashEnergy > 0) mat.emissive.addScalar(this.flashEnergy * ArtConfig.warnFlash.strength);
      if (danger) {
        const d = VisualConfig.danger;
        mat.emissive.r += (0.5 + 0.5 * Math.sin(this.animTime * d.emissiveFreq)) * d.emissivePulse;
      }
    }

    // 짐 스택: 개수 + tilt 수평 전단(MoverView와 동일 부호축) + danger wobble.
    const st = ArtConfig.stackTilt;
    this.visTilt += (this.mover.tilt - this.visTilt) * Math.min(1, st.follow * dt);
    const topIdx = this.mover.cargo - 1;
    for (let i = 0; i < this.boxes.length; i++) {
      this.boxes[i].visible = i < this.mover.cargo;
      let ox = -this.visTilt * st.shearPerLevel * i;
      if (ox > st.maxShear) ox = st.maxShear;
      else if (ox < -st.maxShear) ox = -st.maxShear;
      if (danger && i >= topIdx - 1 && i >= 0) {
        const d = VisualConfig.danger;
        ox += Math.sin(this.animTime * d.wobbleFreq + i) * d.wobbleAmp;
      }
      this.boxes[i].position.x = ox;
    }
  }

  private setAction(next: THREE.AnimationAction | null): void {
    if (!next || next === this.currentAction) return;
    const cf = AssetConfig.walk.crossfade;
    next.enabled = true;
    next.setEffectiveWeight(1);
    next.reset().fadeIn(cf).play();
    if (this.currentAction) this.currentAction.fadeOut(cf);
    this.currentAction = next;
  }

  dispose(): void {
    this.mixer.stopAllAction();
    this.group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      m.geometry?.dispose();
      const mat = m.material;
      const mats = Array.isArray(mat) ? mat : [mat];
      for (const mm of mats) {
        const sm = mm as THREE.MeshStandardMaterial;
        sm.map?.dispose();
        sm.normalMap?.dispose();
        sm.dispose();
      }
    });
  }
}
