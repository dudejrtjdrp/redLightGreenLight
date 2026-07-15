/**
 * MovementSystem.ts
 * 무버의 fake-physics 이동. 실제 강체 없음 — 속도 값 보간만.
 *
 * 딜레마의 물리 근거(TELL 창과 연동):
 *  - 최대 속도  = baseMoveSpeed × 속도모드 배율(빠름 1.0 / 신중 0.5)
 *  - 정지 감속  = 최대속도 / 안정화시간(빠름 ~1.0s / 신중 ~0.3s)
 *    → 신중은 TELL 창(0.8~1.2s) 안에 완전 정지 가능,
 *      빠름은 정지에 ~1.0s가 걸려 TELL이 짧으면 못 멈춤 → 급정지 위험/탈락.
 *  전진 방향은 -z. 속도는 velocity.z(음수=전진)로 표현, x는 사용 안 함(1D 트랙).
 */

import { PlayerConfig } from "../config/PlayerConfig";
import { GameBalance } from "../config/GameBalance";
import { Mover, MoverStatus, SpeedMode } from "./Mover";

/**
 * 한 스텝 이동 적분.
 * @returns 적분 후 전진 속력(유닛/초, 항상 >= 0). RED 판정에 사용.
 */
export function stepMovement(mover: Mover, holding: boolean, dt: number): number {
  // 생존 중이 아니면 즉시 정지(조작 불가).
  if (mover.status !== MoverStatus.ALIVE) {
    mover.velocity.x = 0;
    mover.velocity.z = 0;
    return 0;
  }

  const isFast = mover.speedMode === SpeedMode.FAST;
  const speedMul = isFast ? GameBalance.speed.fast : GameBalance.speed.careful;
  const stabilize = isFast
    ? GameBalance.stabilize.fast
    : GameBalance.stabilize.careful;

  const maxSpeed = PlayerConfig.baseMoveSpeed * speedMul;
  // 감속도: 해당 모드 안정화 시간에 max→0 이 되도록 유도.
  const decel = maxSpeed / stabilize;

  let speed = -mover.velocity.z; // 전진 속력(+)
  const target = holding ? maxSpeed : 0;

  if (speed < target) {
    speed = Math.min(target, speed + PlayerConfig.acceleration * dt);
  } else if (speed > target) {
    speed = Math.max(target, speed - decel * dt);
  }

  mover.velocity.x = 0;
  mover.velocity.z = -speed;
  mover.position.z += mover.velocity.z * dt;

  // 시작선 뒤로는 못 감(전진만).
  const startZ = GameBalance.track.startZ;
  if (mover.position.z > startZ) {
    mover.position.z = startZ;
  }

  return speed;
}
