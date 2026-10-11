import type { ChargerIdentity, Occupancy, TimeRange } from './types.js';

/** 정상 입력의 [시작, 종료) 구간을 비교한다. 같은 경계만 맞닿으면 겹치지 않는다. */
export function intervalsOverlap(a: TimeRange, b: TimeRange): boolean {
  return a.startMs < b.endMs && b.startMs < a.endMs;
}

/** 호출자가 판정한 확정 예약·유효 임시 점유 목록만 검사한다. */
export function hasReservationOverlap(
  charger: ChargerIdentity,
  range: TimeRange,
  occupancies: readonly Occupancy[],
): boolean {
  return occupancies.some((occupancy) =>
    occupancy.charger.statId === charger.statId
    && occupancy.charger.chgerId === charger.chgerId
    && intervalsOverlap(range, occupancy.range),
  );
}
