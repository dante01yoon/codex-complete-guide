import { reduceUserCancellation } from '../rules/refund.ts';

const serverNowMs = Date.parse('2026-10-11T10:00:00+09:00');
const format = new Intl.DateTimeFormat('ko-KR', {
  timeZone: 'Asia/Seoul', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false,
});

export function createDemoReservations() {
  // Explicit fixed-clock fixtures, not general booking or time policies.
  const fixtures = [
    ['demo-150', '시연 충전소 A', '가상 충전기 01', '12:30', '13:30', '2시간 30분'],
    ['demo-60', '시연 충전소 B', '가상 충전기 02', '11:00', '12:00', '1시간'],
    ['demo-20', '시연 충전소 C', '가상 충전기 03', '10:20', '11:20', '20분'],
  ];
  const records = new Map(fixtures.map(([id, station, charger, start, end, remainingLabel]) => [id, {
    id, station, charger, remainingLabel,
    startLabel: format.format(Date.parse(`2026-10-11T${start}:00+09:00`)),
    endLabel: format.format(Date.parse(`2026-10-11T${end}:00+09:00`)),
    state: {
      reservationId: id, originalStartMs: Date.parse(`2026-10-11T${start}:00+09:00`),
      confirmedAtMs: serverNowMs, depositAmount: 3000, status: 'confirmed',
      cancellationReason: null, refundAmount: 0, refundedAmount: 0,
    },
  }]));

  function snapshot() {
    return {
      clockLabel: `${format.format(serverNowMs)} · 서울 시간 고정`,
      confirmedCount: [...records.values()].filter((record) => record.state.status === 'confirmed').length,
      reservations: [...records.values()].map(({ state, ...record }) => ({
        ...record, status: state.status, depositAmount: state.depositAmount,
        refundAmount: reduceUserCancellation(state, { type: 'cancel', atMs: serverNowMs }).state.refundAmount,
        refundedAmount: state.refundedAmount,
      })),
    };
  }

  function cancel(id) {
    const record = records.get(id);
    if (!record) return null;
    const result = reduceUserCancellation(record.state, { type: 'cancel', atMs: serverNowMs });
    record.state = result.state;
    // Mock settlement only. No Toss or succession call is made.
    for (const effect of result.effects) {
      if (effect.type === 'refund') {
        record.state = reduceUserCancellation(record.state, {
          type: 'refund-succeeded', amount: effect.amount,
        }).state;
      }
    }
    return snapshot();
  }

  return { snapshot, cancel };
}
