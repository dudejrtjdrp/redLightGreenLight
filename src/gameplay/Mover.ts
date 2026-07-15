/**
 * Mover.ts
 * 무버(플레이어/더미) 엔티티의 "데이터"만 정의. 렌더/입력은 이후 Phase.
 * 짐 = 점수 철학: cargo 필드가 곧 잠재 점수.
 */

import { PlayerConfig } from "../config/PlayerConfig";
import { Vec2, vec2 } from "./types";

/** 속도 모드: 딜레마의 두 축. 빠름=많이 전진/급정지 위험, 신중=느림/안전 정지. */
export enum SpeedMode {
  FAST = "FAST",
  CAREFUL = "CAREFUL",
}

/** 무버 생존 상태. */
export enum MoverStatus {
  ALIVE = "ALIVE",
  CAUGHT = "CAUGHT", // 레드 때 움직여 탈락
  FINISHED = "FINISHED", // 도착 지점 완주
}

export interface Mover {
  readonly id: number;
  /** 트랙 상 위치 (x, z) */
  position: Vec2;
  /** 현재 속도 벡터 (유닛/초). Fake physics: 값 보간용. */
  velocity: Vec2;
  /** 이동 속도 모드 */
  speedMode: SpeedMode;
  /** 보유 짐 개수 (유한, 리필 없음) */
  cargo: number;
  /** 생존/탈락/완주 상태 */
  status: MoverStatus;
  /** 완주 시 실제로 들고 들어간 짐 개수 (RESOLVE/END 정산용) */
  cargoDelivered: number;

  // --- Phase 4 개정: 스택 균형 킥 상태(스칼라만, 개별 강체 없음) ---
  /** 스택 기울기(부호 있음). 시각 흔들림/색의 소스. */
  tilt: number;
  /** 기울기 속도. */
  tiltVel: number;
  /** 상시 드리프트 바이어스(random-walk). 직진해도 서서히 한쪽으로 쏠리게. */
  driftBias: number;
  /** RED 중 균형(A/D) 보정 누적 경고 수. */
  warnings: number;
  /** 경고 디바운스 남은 시간(초). */
  warnCooldown: number;
}

export function createMover(id: number, spawn: Vec2 = vec2()): Mover {
  return {
    id,
    position: { x: spawn.x, z: spawn.z },
    velocity: vec2(),
    speedMode: SpeedMode.CAREFUL,
    cargo: PlayerConfig.startingCargo,
    status: MoverStatus.ALIVE,
    cargoDelivered: 0,
    tilt: 0,
    tiltVel: 0,
    driftBias: 0,
    warnings: 0,
    warnCooldown: 0,
  };
}

/** 조작 가능 여부(생존 중일 때만 입력 반영). 입력 로직은 이후 Phase. */
export function isControllable(mover: Mover): boolean {
  return mover.status === MoverStatus.ALIVE;
}
