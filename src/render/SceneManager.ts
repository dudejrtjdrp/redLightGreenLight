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

export class SceneManager {
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  readonly renderer: THREE.WebGLRenderer;

  private readonly container: HTMLElement;

  constructor(container: HTMLElement) {
    this.container = container;

    // --- Scene ---
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0b0d12);
    this.scene.fog = new THREE.Fog(0x0b0d12, 18, 40);

    // --- Camera --- 트랙을 비스듬히 내려다보는 3인칭 시점.
    this.camera = new THREE.PerspectiveCamera(
      55,
      this.aspect(),
      0.1,
      100,
    );
    this.camera.position.set(0, 7, 10);
    this.camera.lookAt(0, 0, -2);

    // --- Renderer ---
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(this.width(), this.height());
    this.container.appendChild(this.renderer.domElement);

    this.buildStaticScene();
  }

  /** Phase 1 정적 씬: 바닥 + 조명 + 방향 기준선. */
  private buildStaticScene(): void {
    // 바닥 plane
    const groundGeo = new THREE.PlaneGeometry(30, 60);
    const groundMat = new THREE.MeshStandardMaterial({
      color: 0x1b2230,
      roughness: 0.95,
      metalness: 0.0,
    });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.z = -10;
    this.scene.add(ground);

    // 트랙 진행 방향 감을 주는 그리드
    const grid = new THREE.GridHelper(60, 60, 0x2c3a52, 0x1f2a3a);
    grid.position.z = -10;
    this.scene.add(grid);

    // 조명: 은은한 환경광 + 위에서 내려오는 방향광
    const ambient = new THREE.AmbientLight(0xffffff, 0.55);
    this.scene.add(ambient);

    const dir = new THREE.DirectionalLight(0xffffff, 1.1);
    dir.position.set(5, 12, 6);
    this.scene.add(dir);

    // 씬이 살아있다는 확인용 기준 큐브 (Phase 2에서 무버로 교체 예정)
    const marker = new THREE.Mesh(
      new THREE.BoxGeometry(0.8, 0.8, 0.8),
      new THREE.MeshStandardMaterial({ color: 0x9fe870, roughness: 0.6 }),
    );
    marker.position.set(0, 0.4, 0);
    this.scene.add(marker);
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
}
