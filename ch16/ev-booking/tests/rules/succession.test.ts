import { describe, expect, it } from 'vitest';
import * as rules from '../../src/rules/index.js';

// T-32·T-34·T-36의 확정된 부분만 검증한다. 모든 후보는 자격을 충족하고
// 진행 중 예약이 없으며, 신청 시각은 서로 다르다(C-03·C-06 미정 범위 제외).
// C-01 노쇼 승계 요청·승인 시 잔여 재검사, C-04 정확히 10분 만료는 사용자 답변 반영.
// 사용자 취소 승계에 최소 잔여시간을 적용하는 정책은 아직 미정이다.
// 순수 상태와 효과 요청 계약이며 실제 결제·저장·화면·시계 복구는 검증하지 않는다.
interface Candidate {
  readonly userId: string;
  readonly appliedAtMs: number;
}
interface Offer {
  readonly userId: string;
  readonly requestedAtMs: number;
  readonly expiresAtMs: number;
  readonly amount: number;
}
interface SuccessionState {
  readonly reservationId: string;
  readonly originalStartMs: number;
  readonly originalEndMs: number;
  readonly cancellationReason: 'user' | 'no-show';
  readonly candidates: readonly Candidate[];
  readonly offer: Offer | null;
  readonly expiredOffers: readonly Offer[];
  readonly refundRequestedPaymentIds: readonly string[];
  readonly confirmed: null | {
    readonly userId: string;
    readonly confirmedAtMs: number;
    readonly originalStartMs: number;
    readonly originalEndMs: number;
    readonly checkInDeadlineMs: number;
  };
}
type SuccessionEvent =
  | { readonly type: 'vacancy'; readonly atMs: number }
  | { readonly type: 'tick'; readonly atMs: number }
  | { readonly type: 'verified-payment'; readonly atMs: number;
      readonly userId: string; readonly paymentId: string;
      readonly amount: number; readonly currency: 'KRW'; readonly method: '카드'; readonly status: 'DONE' };
interface SuccessionResult {
  readonly state: SuccessionState;
  readonly effects: readonly ({
    readonly type: 'request-payment'; readonly userId: string;
    readonly amount: number; readonly expiresAtMs: number;
  } | { readonly type: 'refund'; readonly paymentId: string; readonly amount: number })[];
}
type SuccessionReducer = (state: SuccessionState, event: SuccessionEvent) => SuccessionResult;
const at = (time: string): number => Date.parse(`2026-10-06T${time}+09:00`);
function vacant(overrides: Partial<SuccessionState> = {}): SuccessionState {
  return {
    reservationId: 'reservation-A', originalStartMs: at('14:00:00'),
    originalEndMs: at('15:30:00'), cancellationReason: 'no-show',
    // 배열 위치를 순서로 착각하는 구현도 잡도록 신청 역순으로 제공한다.
    candidates: [{ userId: 'C', appliedAtMs: at('10:00:01') },
      { userId: 'B', appliedAtMs: at('10:00:00') }],
    offer: null, confirmed: null, expiredOffers: [], refundRequestedPaymentIds: [], ...overrides,
  };
}
function reduce(state: SuccessionState, event: SuccessionEvent): SuccessionResult {
  const exported = rules as unknown as Record<string, unknown>;
  expect(exported.reduceSuccession, 'src/rules/index.ts의 reduceSuccession가 미구현·미공개입니다').toBeTypeOf('function');
  return (exported.reduceSuccession as SuccessionReducer)(state, event);
}
function requested(): SuccessionState {
  return vacant({ cancellationReason: 'user', offer: {
    userId: 'B', requestedAtMs: at('14:05:00'), expiresAtMs: at('14:15:00'), amount: 3000,
  } });
}

describe('US-11·US-16 — 첫 대기자에게 결제 기회 제공', () => {
  it('AC-11-1·AC-10-3 / 사용자 취소 — 신청 시각이 이른 B에게만 요청, 확정은 보류', () => {
    const result = reduce(vacant({ cancellationReason: 'user' }), { type: 'vacancy', atMs: at('14:05:00') });
    expect(result.state.offer).toEqual({
      userId: 'B', requestedAtMs: at('14:05:00'), expiresAtMs: at('14:15:00'), amount: 3000,
    });
    expect(result.state.confirmed).toBeNull();
    expect(result.effects).toEqual([{ type: 'request-payment', userId: 'B', amount: 3000, expiresAtMs: at('14:15:00') }]);
  });
  it('AC-16-3 / 노쇼 이벤트 반복 — 활성 결제 요청 1건만 유지', () => {
    const event = { type: 'vacancy' as const, atMs: at('14:15:00') };
    const first = reduce(vacant(), event);
    const repeated = reduce(first.state, event);
    expect(first.state.offer?.userId).toBe('B');
    expect(first.effects).toEqual([{ type: 'request-payment', userId: 'B', amount: 3000, expiresAtMs: at('14:25:00') }]);
    expect(repeated.state).toEqual(first.state);
    expect(repeated.effects).toEqual([]);
    expect(repeated.state.confirmed).toBeNull();
  });
  it.each([
    { now: '14:15:00', end: '14:30:00', allowed: false, label: '잔여 15분' },
    { now: '14:15:00', end: '15:00:00', allowed: true, label: '잔여 45분' },
    { now: '14:29:59.999', end: '15:00:00', allowed: true, label: '잔여 30분 +1ms' },
    { now: '14:30:00.000', end: '15:00:00', allowed: true, label: '정확히 잔여 30분' },
    { now: '14:30:00.001', end: '15:00:00', allowed: false, label: '잔여 30분 -1ms' },
    { now: '14:30:01', end: '15:00:00', allowed: false, label: '잔여 29분 59초' },
  ])('AC-11-4·AC-16-3 / $label — 요청 허용=$allowed', ({ now, end, allowed }) => {
    // GIVEN: 원래 예약은 이미 노쇼 취소. 요청 시점의 최소 잔여 조건만 검증한다.
    const result = reduce(vacant({ originalEndMs: at(end) }), { type: 'vacancy', atMs: at(now) });
    expect(result.state.confirmed).toBeNull();
    expect(result.state.originalEndMs).toBe(at(end));
    if (allowed) {
      expect(result.state.offer?.userId).toBe('B');
      expect(result.effects).toHaveLength(1);
      expect(result.effects[0]).toMatchObject({ type: 'request-payment', userId: 'B', amount: 3000 });
    } else {
      expect(result.state.offer).toBeNull();
      expect(result.effects).toEqual([]);
    }
  });
  it('AC-16-3 / 대기자 없음 — 결제 요청·확정 없음', () => {
    const result = reduce(vacant({ candidates: [] }), { type: 'vacancy', atMs: at('14:15:00') });
    expect(result.state.offer).toBeNull();
    expect(result.state.confirmed).toBeNull();
    expect(result.effects).toEqual([]);
  });
});

describe('AC-11-3 / T-33 — 정확히 요청 +10분 만료', () => {
  it.each(['14:15:00.000', '14:15:00.001'])('%s — B 만료, C 요청과 새 10분 기한', (time) => {
    const result = reduce(requested(), { type: 'tick', atMs: at(time) });
    expect(result.state.expiredOffers).toEqual([requested().offer]);
    expect(result.state.offer).toEqual({
      userId: 'C', requestedAtMs: at(time),
      expiresAtMs: at(time === '14:15:00.000' ? '14:25:00.000' : '14:25:00.001'), amount: 3000,
    });
    expect(result.state.confirmed).toBeNull();
    expect(result.effects).toEqual([{
      type: 'request-payment', userId: 'C', amount: 3000,
      expiresAtMs: at(time === '14:15:00.000' ? '14:25:00.000' : '14:25:00.001'),
    }]);
  });
  it('AC-11-3·AC-16-3 / 만료 이벤트 반복 — C 요청을 중복하거나 기한을 늘리지 않음', () => {
    const first = reduce(requested(), { type: 'tick', atMs: at('14:15:00') });
    const repeated = reduce(first.state, { type: 'tick', atMs: at('14:15:00.001') });
    expect(first.state.offer?.userId).toBe('C');
    expect(first.effects).toHaveLength(1);
    expect(repeated.state).toEqual(first.state);
    expect(repeated.effects).toEqual([]);
  });
  it.each(['14:15:00.000', '14:15:00.001'])('%s — 같은 시각 이상에 처음 확인한 B 승인은 전액 환불, 승계 없음', (time) => {
    const result = reduce(requested(), {
      type: 'verified-payment', atMs: at(time), userId: 'B', paymentId: 'late-B',
      amount: 3000, currency: 'KRW', method: '카드', status: 'DONE',
    });
    expect(result.state.confirmed).toBeNull();
    expect(result.effects.filter((effect) => effect.type === 'refund'))
      .toEqual([{ type: 'refund', paymentId: 'late-B', amount: 3000 }]);
    expect(result.state.refundRequestedPaymentIds).toContain('late-B');
  });
  it('AC-11-3·AC-05-4 / 만료 후 C 요청 중 B 늦은 승인 반복 — C 보호, 환불 요청 1회', () => {
    const expired = reduce(requested(), { type: 'tick', atMs: at('14:15:00') });
    const event: SuccessionEvent = {
      type: 'verified-payment', atMs: at('14:15:00'), userId: 'B', paymentId: 'late-B',
      amount: 3000, currency: 'KRW', method: '카드', status: 'DONE',
    };
    const first = reduce(expired.state, event);
    const repeated = reduce(first.state, { ...event, atMs: at('14:15:00.001') });
    expect(first.state.offer).toEqual(expired.state.offer);
    expect(first.state.offer?.userId).toBe('C');
    expect(first.state.confirmed).toBeNull();
    expect(first.effects).toEqual([{ type: 'refund', paymentId: 'late-B', amount: 3000 }]);
    expect(repeated.state).toEqual(first.state);
    expect(repeated.effects).toEqual([]);
  });
});

describe('AC-11-7 / T-34 — 기한 내 승인에도 노쇼 승계 잔여시간 재검사', () => {
  function cRequested(): SuccessionState {
    return vacant({
      originalEndMs: at('15:00:00'), candidates: [{ userId: 'C', appliedAtMs: at('10:00:01') }],
      offer: { userId: 'C', requestedAtMs: at('14:25:00'), expiresAtMs: at('14:35:00'), amount: 3000 },
    });
  }
  function approval(time: string): SuccessionEvent {
    return { type: 'verified-payment', atMs: at(time), userId: 'C', paymentId: 'payment-C',
      amount: 3000, currency: 'KRW', method: '카드', status: 'DONE' };
  }
  it.each([
    { time: '14:29:59.999', deadline: '14:44:59.999', label: '30분 +1ms' },
    { time: '14:30:00.000', deadline: '14:45:00.000', label: '정확히 30분' },
  ])('$label — 승인 시 잔여 조건 통과, 원래 종료 유지', ({ time, deadline }) => {
    const result = reduce(cRequested(), approval(time));
    expect(result.state.confirmed).toEqual({
      userId: 'C', confirmedAtMs: at(time), originalStartMs: at('14:00:00'),
      originalEndMs: at('15:00:00'), checkInDeadlineMs: at(deadline),
    });
    expect(result.effects).toEqual([]);
  });
  it.each(['14:30:00.001', '14:30:01', '14:34:59.999', '14:35:00.000'])('%s — 승인 시 잔여 30분 미만, 승계 없이 3,000원 전액 환불', (time) => {
    const result = reduce(cRequested(), approval(time));
    expect(result.state.confirmed).toBeNull();
    expect(result.state.originalEndMs).toBe(at('15:00:00'));
    expect(result.effects).toEqual([{ type: 'refund', paymentId: 'payment-C', amount: 3000 }]);
    expect(result.state.refundRequestedPaymentIds).toContain('payment-C');
  });
  it('AC-05-4 / 잔여 미달 승인 반복 — 환불 요청 한 번만 유지', () => {
    const first = reduce(cRequested(), approval('14:30:00.001'));
    const repeated = reduce(first.state, approval('14:30:01'));
    expect(first.effects).toEqual([{ type: 'refund', paymentId: 'payment-C', amount: 3000 }]);
    expect(repeated.state).toEqual(first.state);
    expect(repeated.effects).toEqual([]);
  });
  it.each([
    { time: '14:30:00.000', allowed: true, deadline: '14:40:00.000' },
    { time: '14:30:00.001', allowed: false, deadline: '14:40:00.001' },
  ])('AC-11-3·AC-11-4 / $time — 다음 대기자 요청 시에도 잔여 30분 검사', ({ time, allowed, deadline }) => {
    const state = vacant({ originalEndMs: at('15:00:00'), offer: {
      userId: 'B', requestedAtMs: at('14:20:00'), expiresAtMs: at('14:30:00'), amount: 3000,
    } });
    const result = reduce(state, { type: 'tick', atMs: at(time) });
    expect(result.state.expiredOffers).toEqual([state.offer]);
    expect(result.state.confirmed).toBeNull();
    if (allowed) {
      expect(result.state.offer?.userId).toBe('C');
      expect(result.effects).toEqual([{ type: 'request-payment', userId: 'C', amount: 3000, expiresAtMs: at(deadline) }]);
    } else {
      expect(result.state.offer).toBeNull();
      expect(result.effects).toEqual([]);
    }
  });
});

describe('US-11 — 결제 대기와 승인 확정의 구분', () => {
  it.each(['14:14:59', '14:14:59.999'])('AC-11-2 / %s — 10분 직전 미결제는 B의 기회 유지·예약 미확정', (time) => {
    const state = requested();
    const result = reduce(state, { type: 'tick', atMs: at(time) });
    expect(result.state).toEqual(state);
    expect(result.effects).toEqual([]);
  });
  it.each(['14:14:59', '14:14:59.999'])('AC-11-2·AC-11-5·AC-08-4 / %s — 10분 이내 승인은 원래 종료 보존·확정 +15분 기한', (time) => {
    const result = reduce(requested(), {
      type: 'verified-payment', atMs: at(time), userId: 'B', paymentId: 'payment-B',
      amount: 3000, currency: 'KRW', method: '카드', status: 'DONE',
    });
    expect(result.state.confirmed).toEqual({
      userId: 'B', confirmedAtMs: at(time), originalStartMs: at('14:00:00'),
      originalEndMs: at('15:30:00'),
      checkInDeadlineMs: at(time === '14:14:59' ? '14:29:59' : '14:29:59.999'),
    });
    expect(result.effects).toEqual([]);
  });
});
