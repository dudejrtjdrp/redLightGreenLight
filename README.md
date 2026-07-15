# 무궁화 밸런스 게임 (Mugunghwa Balance Game)

"무궁화꽃이 피었습니다" + 불안정한 짐 운반 파티게임.
핵심 철학: **짐 = 점수.**

NHN AI GAME HACKATHON 프로젝트. Three.js + TypeScript + Vite.

## 실행

```bash
npm install
npm run dev
```

브라우저가 자동으로 열리며(`http://localhost:5173`), 검은 화면이 아니라
바닥 그리드 + 조명 + 녹색 기준 큐브가 있는 3D 씬과 좌상단 HUD(FPS/sim steps)가 보이면 정상.

## 폴더 구조

```
src/
  core/     GameLoop, EventBus, ObjectPool  (엔진 코어)
  config/   GameBalance, PlayerConfig, ItemConfig  (모든 수치, 하드코딩 금지)
  render/   SceneManager  (Three.js 씬/카메라/렌더러)
  gameplay/ (Phase 2+: 무버/술래/신호등/짐/점수)
  ui/       (Phase 4+: 리더보드/HUD)
  main.ts   진입점
```

## 설계 원칙

- 고정 timestep 루프: `update(dt)`(결정론적 시뮬) / `render(alpha)`(보간 렌더) 분리, dt 상한으로 스파이럴 방지.
- 이벤트 기반 + 데이터 중심. 상태관리 라이브러리 없음.
- Fake physics: 실제 강체 없음. 낙하는 게임 규칙(`GameBalance.dropModel`)으로 표현.
- 객체 생성 최소화 → `ObjectPool` 적극 사용.

## 진행 상황

- [x] Phase 1: 프로젝트 셋업 + Game Loop + 빈 씬
- [ ] Phase 2: Core System / Gameplay
- [ ] Phase 3: UI
- [ ] Phase 4: Effects / Polishing
```
