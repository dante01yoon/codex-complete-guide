import type { CancellationState } from './refund.js';

export interface DemoReservation extends CancellationState {
  readonly stationName: string;
  readonly statId: string;
  readonly chgerId: string;
  readonly endMs: number;
  readonly address?: string;
}

/** 표시용 시간 계산도 서버 시연 시각을 입력받는 순수 함수로 한정한다. */
export function reservationView(state: DemoReservation, nowMs: number, refundPreviewAmount: number) {
  const remainingMinutes = Math.ceil((state.originalStartMs - nowMs) / 60_000);
  return { ...state, remainingMinutes,
    remainingLabel: remainingMinutes > 0 ? `${remainingMinutes}분` : remainingMinutes === 0 ? '시작 시각' : '시작 후',
    checkinDeadlineMs: state.originalStartMs + 15 * 60_000,
    refundPreviewAmount, unreturnedAmount: state.depositAmount - refundPreviewAmount };
}

/** 승인된 시연 초기값에만 1건 제한·시작 단위 예외를 적용한다. */
export function createDemoReservation(charger: { stationName: string; statId: string; chgerId: string; address?: string },
  reservationId: string, nowMs: number, minutes: number): DemoReservation {
  const originalStartMs = nowMs + minutes * 60_000;
  return { ...charger, reservationId, originalStartMs, endMs: originalStartMs + 60 * 60_000,
    confirmedAtMs: nowMs, depositAmount: 3000, status: 'confirmed', cancellationReason: null,
    refundAmount: 0, refundedAmount: 0 };
}
