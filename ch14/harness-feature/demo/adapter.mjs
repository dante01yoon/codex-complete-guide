import { pathToFileURL } from 'node:url';
import { join } from 'node:path';

// Project-specific wiring only. Business rules remain in src/rules.
export async function getRefundExamples(root) {
  const { reduceUserCancellation } = await import(pathToFileURL(join(root, 'src/rules/refund.ts')).href);
  const date = '2026-10-06';
  const start = `${date}T14:00:00+09:00`;
  const times = ['11:59:59', '12:00:00', '12:00:01', '13:29:59', '13:30:00', '13:30:01', '14:00:00', '14:05:00'];
  const examples = times.map(at => {
    const originalStartMs = Date.parse(start);
    const atMs = Date.parse(`${date}T${at}+09:00`);
    const result = reduceUserCancellation({
      reservationId: 'harness-preview', originalStartMs,
      confirmedAtMs: Date.parse(`${date}T09:00:00+09:00`),
      depositAmount: 3000, status: 'confirmed', cancellationReason: null,
      refundAmount: 0, refundedAmount: 0,
    }, { type: 'cancel', atMs });
    return { at, atMs, remainingSeconds: (originalStartMs - atMs) / 1000,
      amount: result.state.refundAmount, effects: result.effects.map(effect => effect.type) };
  });
  return { status: 'PASS', timezone: 'Asia/Seoul', date, start,
    source: 'src/rules/refund.ts → reduceUserCancellation', examples, externalPayment: 'NOT_RUN' };
}
