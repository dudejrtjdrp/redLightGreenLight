/**
 * types.ts
 * gameplay 레이어 공용 데이터 타입. 렌더/Three.js 의존 없음(순수 데이터).
 * 트랙은 top-down 평면으로 표현: x(가로), z(진행 방향).
 */

export interface Vec2 {
  x: number;
  z: number;
}

export function vec2(x = 0, z = 0): Vec2 {
  return { x, z };
}

export function copyVec2(src: Vec2): Vec2 {
  return { x: src.x, z: src.z };
}
