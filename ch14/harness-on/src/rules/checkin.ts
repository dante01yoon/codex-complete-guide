const MINUTE_MS = 60_000;

/**
 * AC-08-1·AC-08-2의 일반 예약 체크인 시각 판정: [시작 -10분, 시작 +15분).
 * 유효한 epoch milliseconds와 호출자가 제공하는 시연용 현재 시각을 사용한다.
 * 일반 미체크인 확정 예약을 전제로 하며, 권한 검사·상태 전이·환불은 호출자 영역이다.
 */
export function canCheckInGeneralReservation(startMs: number, nowMs: number): boolean {
  return nowMs >= startMs - 10 * MINUTE_MS
    && nowMs < startMs + 15 * MINUTE_MS;
}
