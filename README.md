# 무궁화 밸런스 게임 (redLightGreenLight)

"무궁화 꽃이 피었습니다"에 흔들리는 짐 운반을 더한 3D 웹 파티게임. 짐을 많이 들수록 점수는 오르지만 급하게 멈추면 짐이 떨어지고, 떨어진 짐은 술래 점수가 된다.

2026.07.16 ~ 07.17 · NHN AI GAME HACKATHON 출품작 · 2인 팀(이성효·김태우), 이성효는 게임플레이·시스템 개발 전체와 AI 협업 프로세스를 맡음(저장소 커밋 27건 전부) · Three.js · TypeScript · Vite

## 왜 만들었나

해커톤에서 누구나 룰을 아는 게임에 새 긴장 요소를 하나만 더하고 싶었다. "무궁화 꽃이 피었습니다"는 오징어게임 덕분에 설명 없이도 통한다.
여기에 짐 = 점수 규칙을 붙이면 "빨리 가면 멈출 때 짐을 흘리고, 천천히 가면 시간이 부족한" 딜레마가 자연스럽게 생긴다. 브라우저에서 바로 실행되고 렉이 없어야 한다는 점을 가장 중요한 제약으로 뒀다.

## 주요 기능

- 라운드 상태머신 `GREEN → TELL(구호, 전환창) → RED(정지) → RESOLVE`. RED에서 움직이면 탈락하고, 90초가 지나면 완주하지 못한 생존자도 탈락한다
- 속도 모드(빠름 1.0 / 신중 0.5)와 짐 개수에 따른 이동 속도 보정. 급정지하면 정지 직전 속도에 비례해 짐이 떨어지고, 좌우 균형은 A·D로 되잡는다
- 떨어진 짐은 트랙에 남아 뒤따르는 무버가 주울 수 있다. 탈락자는 들고 있던 짐을 흘리면서 술래 옆으로 걸어가 잡힌 순서대로 줄을 선다
- 홈 화면에서 봇 모드(봇 1~6명)와 디버그 모드(fps/tilt HUD, 콘솔 `__game`)를 고른다. 게임이 끝나면 술래 대 1등 무버 점수로 승패와 결과 화면을 보여준다
- KayKit glb 캐릭터·모듈러 도로 에셋. 불러오기에 실패하면 절차적 캐릭터로 대체한다

## 기술적으로 고민한 것

**1. 고정 timestep 루프와 이벤트 기반 설계**
문제: 3D 렌더링과 게임 판정(RED에서 움직였는지, 짐 낙하)이 프레임레이트에 따라 달라지면 안 된다.
선택: `update(dt)`는 고정 스텝(1/60초)의 결정론적 시뮬레이션으로, `render(alpha)`는 보간 렌더로 분리했다. 한 프레임의 최대 처리 시간을 0.25초로 제한해 death spiral을 막았다. 상태관리 라이브러리 없이 타입 있는 EventBus를 쓰고, 게임플레이 이벤트는 `declare module` 선언 병합으로 추가해서 코어 파일을 건드리지 않았다.
결과: 프레임 드랍이 있어도 판정이 같다. 이 덕분에 같은 게임 코드를 헤드리스 시뮬레이션에서도 그대로 돌릴 수 있었다 (`src/core/GameLoop.ts`, `src/gameplay/GameplayEvents.ts`).

**2. 강체 물리 대신 규칙으로 표현한 Fake Physics**
문제: 짐 더미의 흔들림과 낙하를 강체 시뮬레이션으로 만들면 성능과 튜닝이 모두 어려워진다.
선택: 낙하 개수는 `ceil((정지 직전 속도 − 안전 속도) / step)` 공식으로 정수로 바로 계산한다. 기울기 판정은 danger와 drop 2단계 임계값에 히스테리시스를 둬서 깜빡이지 않게 했다. 낙하 연출은 렌더러가 넘겨주는 실제 최상단 박스의 월드 좌표에서 중력을 적분해 시작한다.
결과: 강체 없이 규칙과 트윈만으로 "흘린다"는 감각을 냈다. 모든 수치는 `src/config/*`에 모아 코드에 하드코딩하지 않았다 (`src/gameplay/BalanceSystem.ts`, `src/gameplay/CargoSystem.ts`).

**3. 시뮬레이션으로 점수 밸런스 맞추기**
문제: 인원수가 바뀌면 술래와 무버의 승률이 크게 흔들렸다(보정 전 술래 승률 14~92%).
선택: 실제 게임 코드를 헤드리스로 4,000라운드 이상 돌려 이벤트 분포를 모으고, 점수 파라미터를 그리드로 탐색했다. 술래 점수원은 인원에 비례해 커지지만 1등 무버 점수는 인원과 상관없다는 구조를 확인했고, 그래서 인원수 보정 `(4/무버수)^1.3`을 도입했다. 제곱으로 커지던 잡기 보너스는 선형으로 바꿨다.
결과: 실제 정산 코드로 600라운드씩 5구간을 돌렸을 때 무버 2~7명 전 구간에서 술래 승률이 46.7~52.2%였다 (`scripts/balanceSim.ts`, `scripts/verifyFinal.ts`).

**4. 봇도 사람과 같은 규칙으로**
문제: 혼자서도 플레이하고 밸런스를 검증하려면 봇이 필요하지만, 봇 전용 룰을 만들면 밸런스 결과가 왜곡된다.
선택: 사람 입력과 봇이 같은 `MoverInput` 인터페이스로 같은 `PlayerSystem`에 들어가게 했다. 봇마다 개성(공격성, 반응속도)을 두고, 초록불이 길어지면 미리 멈추는 행동과 RED에서의 선택(균형 보정 대 짐 흘리기)을 스스로 결정한다.
결과: 봇 대전이 곧 밸런스 시뮬레이션 입력이 된다 (`src/gameplay/BotController.ts`).

## 구조

```
src/
  core/      GameLoop · EventBus · ObjectPool
  config/    GameBalance · BalanceConfig · PlayerConfig · ItemConfig · BotConfig · MapConfig …(모든 수치)
  gameplay/  RoundStateMachine · PlayerSystem · BotController · BalanceSystem · CargoSystem
             ScoreSystem · CaughtMarchSystem
  render/    SceneManager · GameRenderer · CharacterView · MoverView · SeekerView · EffectSystem · MapView
  ui/        UIOverlay · HomeScreen · ResultScreen
  input/     InputController
scripts/     balanceSim.ts · verifyFinal.ts (헤드리스 밸런스 검증)
docs/        게임 기획서 · AI 활용 기술문서 · 팀원 롤 기술서
```

## 실행 방법

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # tsc && vite build
```

조작: 전진 `Space`/`W`/`↑` (떼면 정지) · 균형 되잡기 `A`/`D` · 속도 모드 전환 `Shift`/`E`

밸런스 시뮬레이션 재실행:

```bash
npx esbuild scripts/balanceSim.ts --bundle --platform=node --outfile=/tmp/sim.cjs && node /tmp/sim.cjs
```

## 회고

모든 Phase가 끝날 때마다 실행 가능한 상태로 커밋해서(Phase 1~11) 해커톤 이틀 동안 방향을 여러 번 바꿔도 되돌릴 지점이 있었다.
감으로 수치를 조정하는 대신 시뮬레이션으로 구조적 원인을 찾은 것이 가장 큰 수확이었다. 남은 과제는 떨어진 짐을 주워 가는 스캐빈저 악용 방지, 봇 6명을 동시에 렌더링할 때의 프레임 프로파일링, 사운드다.

---
문의: dudejrtjdrp@naver.com
