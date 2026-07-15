/**
 * MoverView.ts (Phase 8 개정)
 * 무버 = 새하얀·매끈한 이족보행 휴머노이드(MECCHA CHAMELEON 풍). 도마뱀 폐기.
 * 외부 모델 없이 프리미티브 + 간단 본 계층 + 단일 phase 절차 애니메이션.
 *
 * 성능:
 *  - 지오메트리 공유(SHARED). 몸 전체는 인스턴스별 bodyMat 하나로 틴트(부위별 머티리얼 X).
 *  - 워크는 이동거리 기반 단일 phase 스칼라로 구동 → 매 프레임 new/할당 없음.
 *
 * 애니:
 *  - 두 팔은 앞으로 고정된 캐리 포즈, 짐 스택을 두 손 위에 받침.
 *  - 다리 스윙 + 상하 바운스 + 몸통 sway로 걷는 느낌. 워크 속도 = 이동속도 연동(시간 아님).
 *  - RED 정지 시 idle/brace, A/D 균형(tilt)로 몸통 좌우 무게중심 이동.
 *  - 색: 흰 몸 + 상태 틴트 lerp(GREEN 초록 → TELL 빨강 → RED 빨강/경직, 탈락 짙은 빨강).
 *  - 짐 스택은 tilt로 수평 전단(바닥 피벗 회전 없음).
 */

import * as THREE from "three";
import { Mover, MoverStatus, SpeedMode } from "../gameplay/Mover";
import { RoundPhase } from "../gameplay/RoundState";
import { ItemConfig } from "../config/ItemConfig";
import { ArtConfig } from "../config/ArtConfig";
import { VisualConfig } from "../config/VisualConfig";

const TWO_PI = Math.PI * 2;
const ARM_BASE = -1.15; // 어깨를 앞으로 들어올린 캐리 포즈 기준각

// --- 공유 지오메트리(로우폴리) ---
const G = {
  head: new THREE.SphereGeometry(0.2, 14, 12),
  torso: new THREE.CylinderGeometry(0.2, 0.27, 0.55, 12),
  limb: new THREE.CylinderGeometry(0.075, 0.065, 0.4, 8),
  hand: new THREE.SphereGeometry(0.1, 8, 6),
  foot: new THREE.BoxGeometry(0.16, 0.08, 0.26),
  cargo: new THREE.BoxGeometry(
    ItemConfig.visualSize * 2,
    ItemConfig.stackGap * 0.9,
    ItemConfig.visualSize * 2,
  ),
};
const MAT_CARGO = new THREE.MeshStandardMaterial({ color: 0xffcc44, roughness: 0.7 });

interface Leg {
  hip: THREE.Group;
  knee: THREE.Group;
}

export class MoverView {
  readonly group: THREE.Group;

  private readonly bodyPivot: THREE.Group;
  private readonly bodyMat: THREE.MeshStandardMaterial;
  private readonly legs: Leg[] = [];
  private readonly armPivots: THREE.Group[] = [];
  private readonly stack: THREE.Group;
  private readonly boxes: THREE.Mesh[] = [];

  // 절차 애니 상태
  private walkPhase = 0;
  private gait = 0;
  private prevX = 0;
  private prevZ = 0;
  private visTilt = 0;
  private animTime = 0;
  private flinchEnergy = 0;
  private flashEnergy = 0;

  // 색 lerp(in-place)
  private readonly curColor: THREE.Color;
  private readonly curEmissive: THREE.Color;
  private readonly targetColor: THREE.Color;
  private readonly targetEmissive: THREE.Color;

  private phase: RoundPhase = RoundPhase.GREEN;
  private readonly shadows = ArtConfig.scene.shadows;

  constructor(private readonly mover: Mover) {
    const h = VisualConfig.humanoid;
    this.group = new THREE.Group();
    this.prevX = mover.position.x;
    this.prevZ = mover.position.z;

    this.curColor = new THREE.Color(h.bodyGreen);
    this.curEmissive = new THREE.Color(h.emissiveGreen);
    this.targetColor = new THREE.Color(h.bodyGreen);
    this.targetEmissive = new THREE.Color(h.emissiveGreen);

    this.bodyMat = new THREE.MeshStandardMaterial({
      color: this.curColor.clone(),
      emissive: this.curEmissive.clone(),
      roughness: 0.4,
      metalness: 0.0,
    });

    // 다리(발은 group 직속 → 상체가 바운스해도 발은 고정).
    for (const sx of [-1, 1]) this.legs.push(this.buildLeg(sx));

    // 상체(바운스/sway/lean 담당).
    this.bodyPivot = new THREE.Group();
    this.group.add(this.bodyPivot);

    const pelvis = this.mesh(G.torso, 0, 0.62);
    pelvis.scale.set(0.9, 0.5, 0.9);
    this.bodyPivot.add(pelvis);

    const torso = this.mesh(G.torso, 0, 0.95);
    this.bodyPivot.add(torso);

    const head = this.mesh(G.head, 0, 1.32);
    this.bodyPivot.add(head);

    for (const sx of [-1, 1]) this.armPivots.push(this.buildArm(sx));

    // 짐 스택(두 손 위, 앞쪽).
    this.stack = new THREE.Group();
    this.stack.position.set(0, 1.04, 0.34);
    this.bodyPivot.add(this.stack);
    for (let i = 0; i < ItemConfig.maxPerPlayer; i++) {
      const b = new THREE.Mesh(G.cargo, MAT_CARGO);
      b.position.y = i * ItemConfig.stackGap + ItemConfig.stackGap * 0.5;
      b.visible = false;
      this.setShadow(b);
      this.stack.add(b);
      this.boxes.push(b);
    }
  }

  private buildLeg(sx: number): Leg {
    const hip = new THREE.Group();
    hip.position.set(sx * 0.11, 0.6, 0);
    const thigh = this.mesh(G.limb, 0, -0.18);
    thigh.scale.set(1, 0.9, 1);
    hip.add(thigh);
    const knee = new THREE.Group();
    knee.position.y = -0.36;
    hip.add(knee);
    const shin = this.mesh(G.limb, 0, -0.16);
    shin.scale.set(0.9, 0.8, 0.9);
    knee.add(shin);
    const foot = new THREE.Mesh(G.foot, this.bodyMat);
    foot.position.set(0, -0.32, 0.05);
    this.setShadow(foot);
    knee.add(foot);
    this.group.add(hip);
    return { hip, knee };
  }

  private buildArm(sx: number): THREE.Group {
    const sh = new THREE.Group();
    sh.position.set(sx * 0.26, 1.12, 0);
    sh.rotation.x = ARM_BASE;
    const upper = this.mesh(G.limb, 0, -0.16);
    upper.scale.set(0.85, 0.8, 0.85);
    sh.add(upper);
    const elbow = new THREE.Group();
    elbow.position.y = -0.32;
    elbow.rotation.x = -0.55; // 팔뚝을 앞으로
    sh.add(elbow);
    const fore = this.mesh(G.limb, 0, -0.15);
    fore.scale.set(0.8, 0.75, 0.8);
    elbow.add(fore);
    const hand = new THREE.Mesh(G.hand, this.bodyMat);
    hand.position.set(0, -0.3, 0);
    this.setShadow(hand);
    elbow.add(hand);
    this.bodyPivot.add(sh);
    return sh;
  }

  /** 공유 bodyMat 메쉬 헬퍼. */
  private mesh(geo: THREE.BufferGeometry, x: number, y: number): THREE.Mesh {
    const m = new THREE.Mesh(geo, this.bodyMat);
    m.position.set(x, y, 0);
    this.setShadow(m);
    return m;
  }

  private setShadow(m: THREE.Mesh): void {
    if (this.shadows) m.castShadow = true;
  }

  /**
   * 특정 스택 짐의 현재 월드 좌표(낙하 아크 시작점). 실제 렌더 위치(손높이+스택+전단) 반영.
   * out에 담아 반환(호출측 재사용 벡터 → 할당 방지).
   */
  getBoxWorldPosition(index: number, out: THREE.Vector3): THREE.Vector3 {
    const i = Math.max(0, Math.min(this.boxes.length - 1, index));
    return this.boxes[i].getWorldPosition(out);
  }

  setPhase(phase: RoundPhase): void {
    this.phase = phase;
    const h = VisualConfig.humanoid;
    const danger = phase === RoundPhase.TELL || phase === RoundPhase.RED;
    this.targetColor.setHex(danger ? h.bodyRed : h.bodyGreen);
    this.targetEmissive.setHex(danger ? h.emissiveRed : h.emissiveGreen);
  }

  addFlinch(impulse: number): void {
    this.flinchEnergy = Math.min(1, this.flinchEnergy + impulse);
  }

  flash(impulse: number): void {
    this.flashEnergy = Math.min(1, this.flashEnergy + impulse);
  }

  update(dt: number): void {
    const h = VisualConfig.humanoid;
    const w = VisualConfig.walk;
    const caught = this.mover.status === MoverStatus.CAUGHT;
    this.animTime += dt;

    // 위치 + 전진 방향(-z).
    this.group.position.x = this.mover.position.x;
    this.group.position.z = this.mover.position.z;
    this.group.rotation.y = Math.PI;

    // 이동거리 → 워크 phase(시간 아님).
    const dx = this.mover.position.x - this.prevX;
    const dz = this.mover.position.z - this.prevZ;
    this.prevX = this.mover.position.x;
    this.prevZ = this.mover.position.z;
    const dist = Math.hypot(dx, dz);
    const speed = dist / Math.max(dt, 1e-4);
    if (!caught) this.walkPhase += (dist / w.stride) * TWO_PI;
    const moving = !caught && speed > w.moveEps;
    this.gait += ((moving ? 1 : 0) - this.gait) * Math.min(1, w.gaitLerp * dt);

    // --- 색 틴트 lerp ---
    if (caught) {
      this.targetColor.setHex(h.bodyCaught);
      this.targetEmissive.setHex(h.emissiveCaught);
    } else if (this.mover.status === MoverStatus.FINISHED) {
      this.targetColor.setHex(h.bodyGreen);
      this.targetEmissive.setHex(h.emissiveGreen);
    }
    const t = Math.min(1, h.colorLerpSpeed * dt);
    this.curColor.lerp(this.targetColor, t);
    this.curEmissive.lerp(this.targetEmissive, t);
    this.bodyMat.color.copy(this.curColor);
    this.bodyMat.emissive.copy(this.curEmissive);
    if (this.flashEnergy > 0) {
      this.flashEnergy = Math.max(
        0,
        this.flashEnergy - ArtConfig.warnFlash.decayPerSec * dt,
      );
      this.bodyMat.emissive.addScalar(this.flashEnergy * ArtConfig.warnFlash.strength);
    }
    // 아슬아슬(danger): 붉은 강조 깜빡임(낙하 예고). 탈락/완주 아닐 때만.
    const danger = this.mover.inDanger && !caught;
    if (danger) {
      const d = VisualConfig.danger;
      const pulse = (0.5 + 0.5 * Math.sin(this.animTime * d.emissiveFreq)) * d.emissivePulse;
      this.bodyMat.emissive.r += pulse;
    }
    this.bodyMat.emissiveIntensity =
      this.mover.speedMode === SpeedMode.FAST && !caught ? 1.1 : 0.85;

    const braceAmt = 1 - this.gait; // 정지에 가까울수록 1

    // --- 다리 스윙(이동) + 벌림(브레이스) ---
    const sw = Math.sin(this.walkPhase);
    const sw2 = Math.sin(this.walkPhase + Math.PI);
    this.legs[0].hip.rotation.x = sw * w.legSwing * this.gait;
    this.legs[1].hip.rotation.x = sw2 * w.legSwing * this.gait;
    this.legs[0].knee.rotation.x = Math.max(0, -sw) * w.kneeBend * this.gait;
    this.legs[1].knee.rotation.x = Math.max(0, -sw2) * w.kneeBend * this.gait;
    // 브레이스: 다리를 벌려 안정된 자세.
    this.legs[0].hip.rotation.z = w.braceSplay * braceAmt;
    this.legs[1].hip.rotation.z = -w.braceSplay * braceAmt;

    // --- 상체 바운스 + sway + lean(이동=무게중심 / 정지=카운터-린 브레이스) ---
    const bounce = Math.abs(Math.sin(this.walkPhase)) * w.bounce * this.gait;
    const sway = Math.sin(this.walkPhase) * w.sway * this.gait;
    const bal = VisualConfig.balance;
    let lean =
      this.mover.tilt * (bal.leanScale * this.gait - bal.braceLeanScale * braceAmt);
    const ml = bal.maxLean;
    if (lean > ml) lean = ml;
    else if (lean < -ml) lean = -ml;
    const brace = this.phase === RoundPhase.RED && this.gait < 0.5 ? w.braceCrouch : 0;

    // --- 팔 캐리 포즈 + 미세 bob ---
    const bob = Math.sin(this.walkPhase * 2) * w.armBob * this.gait;
    this.armPivots[0].rotation.x = ARM_BASE + bob;
    this.armPivots[1].rotation.x = ARM_BASE - bob;

    // --- 플린치(상체 스쿼시) ---
    let sx = 1;
    let sy = 1;
    if (this.flinchEnergy > 0) {
      this.flinchEnergy = Math.max(
        0,
        this.flinchEnergy - ArtConfig.flinch.decayPerSec * dt,
      );
      const s = this.flinchEnergy * ArtConfig.flinch.scale;
      sx = 1 + s;
      sy = 1 - s;
    }
    this.bodyPivot.position.y = bounce - brace;
    this.bodyPivot.rotation.z = sway + lean;
    this.bodyPivot.scale.set(sx, sy, sx);

    // --- 짐 개수 표시 + tilt 수평 전단(바닥 피벗 회전 없음) ---
    const st = ArtConfig.stackTilt;
    this.visTilt += (this.mover.tilt - this.visTilt) * Math.min(1, st.follow * dt);
    const topIdx = this.mover.cargo - 1; // 맨 위 짐
    for (let i = 0; i < this.boxes.length; i++) {
      this.boxes[i].visible = i < this.mover.cargo;
      let ox = this.visTilt * st.shearPerLevel * i;
      if (ox > st.maxShear) ox = st.maxShear;
      else if (ox < -st.maxShear) ox = -st.maxShear;
      // 아슬아슬: 맨 위 짐은 가장자리에서 미세하게 wobble(떨어질랑말랑).
      if (danger && i >= topIdx - 1 && i >= 0) {
        const d = VisualConfig.danger;
        ox += Math.sin(this.animTime * d.wobbleFreq + i) * d.wobbleAmp;
      }
      this.boxes[i].position.x = ox;
    }
  }
}
