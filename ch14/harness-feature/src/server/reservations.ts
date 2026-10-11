import { reduceUserCancellation } from '../rules/refund.ts';
import { reservationView } from '../rules/reservation-view.ts';
import type { DemoReservation } from '../rules/reservation-view.ts';

export function createReservationsDemo(input: { nowMs: number; reservations: readonly DemoReservation[] }) {
  const states = new Map(input.reservations.map(row => [row.reservationId, { ...row }]));
  function view(state: DemoReservation) {
    const preview = reduceUserCancellation(state, { type: 'cancel', atMs: input.nowMs });
    return reservationView(state, input.nowMs, preview.state.refundAmount);
  }
  return {
    list() {
      return { nowMs: input.nowMs, timezone: 'Asia/Seoul', mock: true,
        externalPayment: 'NOT_RUN', reservations: Array.from(states.values(), view) };
    },
    cancel(id: string) {
      const state = states.get(id);
      if (!state) return null;
      const cancelled = reduceUserCancellation(state, { type: 'cancel', atMs: input.nowMs });
      // 모의 성공 기록만 반영한다. 외부 환불·대기 승계 효과는 실행하지 않는다.
      const returned = reduceUserCancellation(cancelled.state,
        { type: 'refund-succeeded', amount: cancelled.state.refundAmount });
      const next = { ...state, ...returned.state };
      states.set(id, next);
      return view(next);
    },
  };
}
