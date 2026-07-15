# 무궁화 밸런스 게임 (Mugunghwa Balance Game)

"무궁화꽃이 피었습니다" + 불안정한 짐 운반 파티게임.
핵심 철학: **짐 = 점수.** 한 번의 낙하가 "내 -1점 + 술래 +1점"의 자해 구조를 만든다.

NHN AI GAME HACKATHON 프로젝트 · Three.js + TypeScript + Vite · v1 싱글플레이 프로토타입.

## 실행

```bash
npm install
npm run dev
```

브라우저가 자동으로 열립니다(`http://localhost:5173`).
우상단 UI에 페이즈/타이머/짐/리더보드가, 좌상단에 개발 디버그(fps)가 보이면 정상.
콘솔에 시작 시 `[BALANCE CHECK]` 정합성 시뮬이 1회 출력됩니다.

## 조작

| 동작 | 키 |
|---|---|
| 전진 (누르는 동안 이동, 떼면 정지) | `Space` / `W` / `↑` |
| 속도모드 토글 (빠름 100% ↔ 신중 50%) | `Shift` / `E` |

### 딜레마
- **빠름**: 많이 전진하지만 정지에 ~1.0s가 걸려 TELL 창(0.8~1.2s)이 짧으면 못 멈춤 → 레드 탈락 위험.
- **신중**: 느리지만 ~0.3s에 완전 정지 → TELL 안에서 안전.
- 급정지(전진 중 놓기)하면 정지 직전 속도에 비례해 **짐이 떨어진다**. 떨어진 짐은 트랙에 남고 술래가 점수를 가져간다.

## 라운드 흐름

`LOBBY → GREEN(이동) → TELL(전환창) → RED(정지) → RESOLVE(정산) → …반복… → END`

- RED에서 움직이면 즉시 탈락. TELL은 "무궁화 꽃이 피었…" 구호 + 술래가 돌아보는 창.
- 90~120s 경과 또는 전원 완주/탈락 시 END → 최종 점수 정산(콘솔 출력).
- 빈 턴 반환: RED 동안 아무 활동(이동/낙하)이 없으면 그 시간을 라운드 예산에 되돌려줌.

## 점수

- **무버** = 반입 짐 × 1 + 생존보너스(`K / 생존자수`). 생존자 줄수록 커지는 후반 가속형. 탈락자는 0.
- **술래** = 낙하 수확 × `dropPointScale` + 잡기보너스(`c(c+1)/2`). 후반 가속형.
- 북극성: **기대 술래 점수 ≈ 기대 1등 무버 점수.**

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
| **생존보너스 K** | **28** | GameBalance.score | Phase 7: 24→28 (무버↑) |
| **낙하 점수 배율** | **0.6** | GameBalance.score | Phase 7: 1→0.6 (술래↓) |
| 잡기 보너스 배율 | 1 | GameBalance.score | |
| 트랙 길이 | 32 | GameBalance.track | 튜닝 노브 |
| 이동 감지 임계 | 0.08 | GameBalance.judge | |
| 시작 짐 / 상한 | 5 / 5 | PlayerConfig · ItemConfig | 확정 규칙 |
| 회수 반경 | 0.9 | ItemConfig | |
| 재수확 상한 | 3 | ItemConfig | |

### 밸런스 검증
8인 시나리오(무버 7 + 술래 1, 술래 3잡·10낙하, 생존 4, 1등 반입 5)를 `simulateReference()`로 검증:
- 튜닝 전: 술래 **16** vs 1등무버 **11** (격차 5)
- 튜닝 후(K 28, dropScale 0.6): 술래 **12.0** vs 1등무버 **12.0** (격차 0)

콘솔에서 `__game.simulateReference({ seekerCatches: 5 })` 처럼 시나리오를 바꿔 실험 가능.
`__game`으로 round/player/seeker/cargo/scoreSystem 등에 접근할 수 있습니다.

## 폴더 구조

```
src/
  core/     GameLoop, EventBus, ObjectPool
  config/   GameBalance, PlayerConfig, ItemConfig, EffectConfig   (모든 수치)
  gameplay/ RoundStateMachine, Mover, Seeker, Item, MovementSystem,
            PlayerSystem, CargoSystem, ScoreSystem, BalanceDebug, GameplayEvents
  input/    InputController
  render/   SceneManager, GameRenderer, MoverView, SeekerView,
            DroppedItemsView, EffectSystem
  ui/       UIOverlay
  main.ts   진입점
```

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

## 남은 과제 (TODO)
- **회수/스캐빈저 남용**: 뒤 무버가 앞 낙하물을 공짜로 쓸어담는 악용 방지책(비용/딜레이/횟수 제한) 미정. (`CargoSystem` TODO 주석 참고)
- **재수확 상한** 3의 적정성 실플레이 미검증.
- **멀티/더미 무버 부재**: v1 싱글이라 회수·비대칭 경쟁이 실측되지 않음. 더미 무버 또는 v2 네트워크 필요.
- **라운드 재시작** UI 없음(현재 새로고침으로 리셋).
- **프레임 프로파일링**: 저사양 기기 실측 후 이펙트 `poolSize`/`freq` 조정 여지.
- **사운드/추가 폴리싱** 미착수.
```
