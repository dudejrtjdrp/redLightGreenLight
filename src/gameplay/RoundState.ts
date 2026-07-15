/**
 * RoundState.ts
 * 라운드 페이즈 정의.
 *
 * 흐름: LOBBY → GREEN → TELL → RED → RESOLVE → (GREEN 반복 | END)
 *
 *  - LOBBY   : 시작 대기.
 *  - GREEN   : 이동 허용. 무버가 전진하는 유일한 구간.
 *  - TELL    : 그린→레드 "전환 예고 창"(0.8~1.2s 고정).
 *              ★ 딜레마의 물리적 근거 ★
 *              신중(느림)은 이 창 안에 완전 정지가 가능하지만,
 *              빠름(전속)은 이 창 안에 멈추지 못해 급정지 → 짐 낙하 위험.
 *              이 창이 존재하기 때문에 "빨리 갈까 vs 안전하게 갈까"가 성립한다.
 *  - RED     : 정지 필수. 이때 움직이면 즉시 탈락(아웃).
 *  - RESOLVE : 낙하/체포/점수 정산 처리 창(짧은 고정 창).
 *  - END     : 라운드 종료(시간 초과 또는 전원 완주/탈락).
 */

export enum RoundPhase {
  LOBBY = "LOBBY",
  GREEN = "GREEN",
  TELL = "TELL",
  RED = "RED",
  RESOLVE = "RESOLVE",
  END = "END",
}

export const RoundPhaseName: Record<RoundPhase, string> = {
  [RoundPhase.LOBBY]: "로비",
  [RoundPhase.GREEN]: "그린(이동)",
  [RoundPhase.TELL]: "전환창",
  [RoundPhase.RED]: "레드(정지)",
  [RoundPhase.RESOLVE]: "정산",
  [RoundPhase.END]: "종료",
};
