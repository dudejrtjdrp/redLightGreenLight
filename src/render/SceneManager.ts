/**
 * SceneManager.ts
 * Three.js 씬/카메라/렌더러 소유자. 렌더링 파이프라인의 유일한 진입점.
 * Phase 1: 빈 씬(바닥 plane + 조명 + 카메라)만 구성. 게임플레이 객체는 이후 Phase에서 추가.
 *
 * 퍼포먼스 원칙:
 *  - antialias는 켜되 pixelRatio 상한으로 과도한 렌더 부담 차단.
 *  - 그림자는 Phase 1에서 켜지 않음(불필요한 비용 회피). 필요 시 이후 도입.
 */

import * as THREE from "three";
import { GameBalance } from "../config/GameBalance";
import { ArtConfig } from "../config/ArtConfig";

export class SceneManager {
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  readonly renderer: THREE.WebGLRenderer;

  private readonly container: HTMLElement;

  constructor(container: HTMLElement) {
    this.container = container;

    // --- Scene --- 그라디언트 스카이(하늘→지평선). 안개 색은 지평선에 맞춤.
    this.scene = new THREE.Scene();
    this.scene.background = SceneManager.makeSkyTexture(
      ArtConfig.scene.skyTop,
      ArtConfig.scene.skyHorizon,
    );
    this.scene.fog = new THREE.Fog(
      ArtConfig.scene.skyHorizon,
      ArtConfig.scene.fogNear,
      ArtConfig.scene.fogFar,
    );

    // --- Camera --- 트랙을 비스듬히 내려다보는 3인칭 시점.
    this.camera = new THREE.PerspectiveCamera(
      55,
      this.aspect(),
      0.1,
      100,
    );
    this.camera.position.set(0, 7, 10);
    this.camera.lookAt(0, 0, -2);

    // --- Renderer --- 가벼운 톤매핑(ACES) + 선택적 소프트 그림자 1개.
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(this.width(), this.height());
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = ArtConfig.scene.exposure;
    if (ArtConfig.scene.shadows) {
      this.renderer.shadowMap.enabled = true;
      this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    }
    this.container.appendChild(this.renderer.domElement);

    this.buildStaticScene();
  }

  /** 정적 씬: 바닥 + 조명(소프트 그림자 1개) + 시작/도착선. */
  private buildStaticScene(): void {
    // 바닥 plane (밝은 파스텔, 그림자 수신).
    const groundGeo = new THREE.PlaneGeometry(30, 70);
    const groundMat = new THREE.MeshStandardMaterial({
      color: 0xcfe8d0,
      roughness: 0.95,
      metalness: 0.0,
    });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.z = -12;
    ground.receiveShadow = ArtConfig.scene.shadows;
    this.scene.add(ground);

    // 은은한 그리드(연한 톤).
    const grid = new THREE.GridHelper(70, 70, 0x8fb89a, 0xb7d8be);
    grid.position.set(0, 0.01, -12);
    (grid.material as THREE.Material).transparent = true;
    (grid.material as THREE.Material).opacity = 0.35;
    this.scene.add(grid);

    // 환경광 + 방향광(그림자 caster 1개).
    const ambient = new THREE.AmbientLight(0xffffff, 0.7);
    this.scene.add(ambient);
    const hemi = new THREE.HemisphereLight(0xffffff, 0xbfe3c0, 0.35);
    this.scene.add(hemi);

    const dir = new THREE.DirectionalLight(0xfff4e0, 1.25);
    dir.position.set(6, 14, 8);
    if (ArtConfig.scene.shadows) {
      dir.castShadow = true;
      const s = ArtConfig.scene.shadowMapSize;
      dir.shadow.mapSize.set(s, s);
      dir.shadow.camera.near = 1;
      dir.shadow.camera.far = 60;
      const half = 20;
      dir.shadow.camera.left = -half;
      dir.shadow.camera.right = half;
      dir.shadow.camera.top = half;
      dir.shadow.camera.bottom = -half;
      dir.shadow.bias = -0.0005;
    }
    // 타깃을 트랙 중앙으로.
    dir.target.position.set(0, 0, GameBalance.track.startZ - GameBalance.track.length / 2);
    this.scene.add(dir);
    this.scene.add(dir.target);

    // 완주선(도착 지점) 강조: 발광 + 위로 뻗는 라이트 필러.
    const finishZ = GameBalance.track.startZ - GameBalance.track.length;
    const laneW = GameBalance.track.laneHalfWidth * 2 + 1;
    const finish = new THREE.Mesh(
      new THREE.BoxGeometry(laneW, 0.06, 0.5),
      new THREE.MeshStandardMaterial({
        color: 0x9fe870,
        emissive: 0x4fae2a,
        emissiveIntensity: 1.2,
        roughness: 0.4,
      }),
    );
    finish.position.set(0, 0.04, finishZ);
    this.scene.add(finish);

    const pillar = new THREE.Mesh(
      new THREE.BoxGeometry(laneW, 3.2, 0.06),
      new THREE.MeshBasicMaterial({
        color: 0x9fe870,
        transparent: true,
        opacity: 0.16,
      }),
    );
    pillar.position.set(0, 1.6, finishZ);
    this.scene.add(pillar);

    // 시작선.
    const start = new THREE.Mesh(
      new THREE.BoxGeometry(laneW, 0.06, 0.4),
      new THREE.MeshStandardMaterial({ color: 0xf0d9a0, roughness: 0.7 }),
    );
    start.position.set(0, 0.04, GameBalance.track.startZ);
    this.scene.add(start);
  }

  /** GameLoop.render(alpha)에서 호출. Phase 1은 alpha 미사용(정적 씬). */
  render(_alpha: number): void {
    this.renderer.render(this.scene, this.camera);
  }

  /** 뷰포트 리사이즈 대응. */
  resize(): void {
    this.camera.aspect = this.aspect();
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(this.width(), this.height());
  }

  dispose(): void {
    this.renderer.dispose();
    if (this.renderer.domElement.parentElement === this.container) {
      this.container.removeChild(this.renderer.domElement);
    }
  }

  private width(): number {
    return this.container.clientWidth || window.innerWidth;
  }
  private height(): number {
    return this.container.clientHeight || window.innerHeight;
  }
  private aspect(): number {
    return this.width() / this.height();
  }

  /** 세로 그라디언트 하늘 텍스처(정적, 매 프레임 갱신 없음). */
  private static makeSkyTexture(
    topHex: number,
    bottomHex: number,
  ): THREE.Texture | THREE.Color {
    const c = document.createElement("canvas");
    c.width = 2;
    c.height = 256;
    const ctx = c.getContext("2d");
    if (!ctx) return new THREE.Color(bottomHex);
    const grad = ctx.createLinearGradient(0, 0, 0, c.height);
    grad.addColorStop(0, "#" + topHex.toString(16).padStart(6, "0"));
    grad.addColorStop(1, "#" + bottomHex.toString(16).padStart(6, "0"));
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, c.width, c.height);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.needsUpdate = true;
    return tex;
  }
}
