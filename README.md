# 무궁화 밸런스 게임 (Mugunghwa Balance Game)

"무궁화꽃이 피었습니다" + 불안정한 짐 운반 파티게임.
핵심 철학: **짐 = 점수.** 한 번의 낙하가 "내 -1점 + 술래 +1점"의 자해 구조를 만든다.

NHN AI GAME HACKATHON 프로젝트 · Three.js + TypeScript + Vite · v2 봇 대전 프로토타입.

## 실행

```bash
npm install
npm run dev
```

브라우저가 자동으로 열립니다(`http://localhost:5173`).
**홈 화면**에서 모드를 선택합니다:

- **🤖 봇 모드**: 나 + 봇 1~6명(홈에서 인원 지정). 상단 타이머 **1분 30초**, 종료 시
  **술래 승 / 플레이어 승** 결과 화면(다시 하기 / 홈으로).
- **🛠 디버그 모드**: 싱글 플레이 + 좌상단 개발 HUD(fps/tilt) + 콘솔 `__game` 노출 +
  시작 시 `[BALANCE CHECK]` 정합성 시뮬 1회 출력.

## 조작

| 동작 | 키 |
|---|---|
| 전진 (누르는 동안 이동, 떼면 정지) | `Space` / `W` / `↑` |
| 좌우 균형 되잡기 / 이동 | `A` · `D` (`←` `→`) |
| 속도모드 토글 (빠름 100% ↔ 신중 50%) | `Shift` / `E` |

### 딜레마
- **빠름**: 많이 전진하지만 정지에 ~1.0s가 걸려 TELL 창(0.8~1.2s)이 짧으면 못 멈춤 → 레드 탈락 위험.
- **신중**: 느리지만 ~0.3s에 완전 정지 → TELL 안에서 안전.
- 급정지(전진 중 놓기)하면 정지 직전 속도에 비례해 **짐이 떨어진다**. 떨어진 짐은 트랙에 남고 술래가 점수를 가져간다.

## 라운드 흐름

`LOBBY → GREEN(이동) → TELL(전환창) → RED(정지) → RESOLVE(정산) → …반복… → END`

- RED에서 움직이면 즉시 탈락. TELL은 "무궁화 꽃이 피었…" 구호 + 술래가 돌아보는 창.
- **90초(1분 30초)** 경과 또는 전원 완주/탈락 시 END → 정산 + 결과 화면.
- 빈 턴 반환: RED 동안 아무 활동(이동/낙하)이 없으면 그 시간을 라운드 예산에 되돌려줌.

## 점수

- **무버** = 반입 짐 × 1 + 생존보너스(`K / 생존자수`). 생존자 줄수록 커지는 후반 가속형. 탈락자는 0.
- **술래** = (낙하 수확 × `dropPointScale` + 잡기보너스 `c(c+1)/2 × catchBonusScale`) × **인원수 보정 `(4/무버수)^1`**.
- 승패: 술래 점수 vs 1등 무버 점수 — 높은 쪽 승리.
- 북극성: **기대 술래 점수 ≈ 기대 1등 무버 점수** (인원수와 무관하게).

## 현재 튜닝값 (`src/config/`)

모든 수치는 Config에만 있고 코드 하드코딩 없음. Phase 7에서 아래로 조정.

| 항목 | 값 | 파일 | 비고 |
|---|---|---|---|
| 속도 배율 (빠름/신중) | 1.0 / 0.5 | GameBalance.speed | 확정 규칙 |
| 안정화 시간 (빠름/신중) | 1.0s / 0.3s | GameBalance.stabilize | 확정 규칙 |
| GREEN 지속 | 2.0~5.0s | GameBalance.signal | 튜닝 노브 |
| TELL 전환창 | 0.8~1.2s | GameBalance.signal | 확정 규칙 |
| RED 지속 | 1.0~4.0s | GameBalance.signal | 확정 규칙 |
| RESOLVE 지속 | 0.6s | GameBalance.signal | 튜닝 노브 |
| 낙하 모델 (safeSpeed/step) | 0.35 / 0.28 | GameBalance.dropModel | 풀 3개·신중 1개·안전이하 0개 |
| **생존보너스 K** | **20** | GameBalance.score | Phase 9: 28→20 (시뮬 최적화) |
| **낙하 점수 배율** | **1.8** | GameBalance.score | Phase 9: 0.6→1.8 (자해 스윙↑) |
| **잡기 보너스 배율** | **0.9** | GameBalance.score | Phase 9: 1→0.9 |
| **술래 인원수 보정** | **(4/무버수)^1** | GameBalance.score.seekerCountNorm | Phase 9 신규 |
| 트랙 길이 / 레인 반폭 | 32 / **7.0** | GameBalance.track | Phase 9: 레인 4.5→7.0 (길 확장) |
| 라운드 시간 | **90s 고정** | GameBalance.round | Phase 9: 90~120 랜덤→90 고정 |
| 이동 감지 임계 | 0.08 | GameBalance.judge | |
| 시작 짐 / 상한 | 5 / 5 | PlayerConfig · ItemConfig | 확정 규칙 |
| 회수 반경 | 0.9 | ItemConfig | |
| 재수확 상한 | 3 | ItemConfig | |

### 밸런스 검증 (Phase 9: 봇 시뮬레이션 기반)
실제 게임 코드를 헤드리스로 4,000+ 라운드 돌려(`scripts/balanceSim.ts`) 라운드 이벤트 분포를
수집하고, 점수 노브(K/dropScale/catchScale/인원수보정) 그리드를 탐색해 최적화:

- **발견**: 술래 점수원(낙하·잡기)은 인원수에 비례해 커지지만 1등 무버 점수는 인원과 무관
  → 단일 배율로는 인원별 밸런스 불가 → **인원수 보정 `×(4/무버수)` 신규 도입**.
- **결과** (K=20, drop=1.8, catch=0.9, 보정 ON — 실제 정산 코드로 600라운드×5구간 검증):

| 무버 수 | 술래 승률 | 플레이어 승률 |
|---|---|---|
| 2 (봇1) | 49.3% | 50.5% |
| 3 (봇2) | 45.5% | 54.5% |
| 4 (봇3) | 43.2% | 56.8% |
| 5 (봇4) | 45.0% | 55.0% |
| 7 (봇6) | 57.5% | 42.5% |

재실행: `npx esbuild scripts/balanceSim.ts --bundle --platform=node --outfile=/tmp/sim.cjs && node /tmp/sim.cjs`

콘솔에서 `__game.simulateReference({ seekerCatches: 5 })` 처럼 시나리오를 바꿔 실험 가능.
`__game`으로 round/player/seeker/cargo/scoreSystem 등에 접근할 수 있습니다.

## 폴더 구조

```
src/
  core/     GameLoop, EventBus, ObjectPool
  config/   GameBalance, PlayerConfig, ItemConfig, EffectConfig, BotConfig   (모든 수치)
  gameplay/ RoundStateMachine, Mover, Seeker, Item, MovementSystem,
            PlayerSystem, BotController(봇 AI), CargoSystem, ScoreSystem,
            BalanceDebug, GameplayEvents
  input/    InputController
  render/   SceneManager, GameRenderer, MoverView, CharacterView, SeekerView,
            DroppedItemsView, EffectSystem, MapView
  ui/       UIOverlay, HomeScreen(홈), ResultScreen(승패 결과)
  main.ts   진입점 (홈 → 모드별 게임 구성)
scripts/
  balanceSim.ts   점수 밸런스 헤드리스 시뮬레이션(노브 그리드 탐색)
  verifyFinal.ts  최종 밸런스 검증(실제 정산 코드 경로)
```

### 봇 AI (Phase 9)
봇은 `MoverInput` 인터페이스로 사람 입력과 동일하게 `PlayerSystem`에 꽂힌다(전용 치트 없음).
- 개성(persona): 공격성/반응속도/출발지연을 봇마다 샘플.
- GREEN: CAREFUL은 계속 전진, FAST는 "치고-멈추기" 버스트 + **예측 정지**(그린이 1.8~3.0s
  넘으면 곧 레드라 직감하고 감속 — 사람의 몸 사리기 모사).
- TELL: 반응시간 후 정지(CAREFUL만 공격성 비례로 살짝 밀어붙임).
- RED: 드물게 지각(1.5%) → 탈락. 균형이 무너지면 성향에 따라 "보정(경고 소모) vs 흘림(짐 낙하)"
  의 RED 딜레마를 스스로 결정.
- 넓어진 길(±7)을 좌우 배회(wander)로 활용.

## 설계 원칙
- 고정 timestep 루프: `update(dt)`(결정론적 시뮬) / `render(alpha)`(렌더) 분리, dt 상한으로 스파이럴 방지.
- 이벤트 기반 + 데이터 중심. 상태관리 라이브러리 없음. EventMap은 선언 병합으로 확장.
- Fake physics: 실제 강체 없음. 낙하/흔들림/술래회전은 규칙·트윈으로만 표현.
- 객체 생성 최소화 → 짐·이펙트·낙하물 표시 전부 Object Pool.

## 진행 상황
- [x] Phase 1: 셋업 + Game Loop + 빈 씬
- [x] Phase 2: 라운드 상태머신 + 데이터 모델
- [x] Phase 3: 이동 + 레드라이트 탈락 + 완주
- [x] Phase 4: 급정지 낙하 + 회수 + 점수 귀속
- [x] Phase 5: 최종 정산 + 라운드 종료 + 정합성 시뮬
- [x] Phase 6: UI 오버레이 + 풀 기반 이펙트 + 렌더
- [x] Phase 7: 폴리싱 + 밸런스 튜닝
- [x] Phase 8: KayKit 캐릭터/맵 아트
- [x] Phase 9: 홈 화면 + 봇 모드(1~6명) + 90s 타이머 + 승패 결과 + 길 확장 + 시뮬 기반 점수 밸런스

## 남은 과제 (TODO)
- **회수/스캐빈저 남용**: 뒤 무버가 앞 낙하물을 공짜로 쓸어담는 악용 방지책(비용/딜레이/횟수 제한) 미정. (`CargoSystem` TODO 주석 참고)
- **재수확 상한** 3의 적정성 실플레이 미검증.
- **7인(봇6) 구간** 술래 승률 57.5%로 소폭 우세 — 인원수 보정 power 미세 조정 여지.
- **프레임 프로파일링**: 봇 6명 + glb 7체 동시 렌더 실측 후 이펙트 `poolSize` 조정 여지.
- **사운드/추가 폴리싱** 미착수.
