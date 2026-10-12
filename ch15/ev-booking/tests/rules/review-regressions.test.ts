import { describe, expect, it } from 'vitest';
import {
  reduceNoShow,
  reduceSuccession,
  type NoShowState,
  type SuccessionEvent,
  type SuccessionState,
} from '../../src/rules/index.js';

// 리뷰 P1: C 확정 후 조기 반환으로 인한 B 환불 누락과 중복 환불을 검출한다.
// 리뷰 P2: 시작 전 승계에 확정 +15분을 적용하는 기한 계산·노쇼 분기를 검출한다.
// C-02는 2026-10-11 사용자 답변 반영. 순수 규칙만 검증하며 실제 환불·저장·UI는 제외.
// 테스트 작성 단계: 사용자 내용 확인 전에는 실행하지 않고 제품 구현도 변경하지 않는다.
const at = (dateTime: string): number => Date.parse(`${dateTime}+09:00`);

function vacant(): SuccessionState {
  return {
    reservationId: 'reservation-A',
    originalStartMs: at('2026-10-12T14:00:00'),
    originalEndMs: at('2026-10-12T15:30:00'),
    cancellationReason: 'user',
    candidates: [
      { userId: 'B', appliedAtMs: at('2026-10-11T09:00:00') },
      { userId: 'C', appliedAtMs: at('2026-10-11T09:00:01') },
    ],
    offer: null,
    expiredOffers: [],
    refundRequestedPaymentIds: [],
    confirmed: null,
  };
}

function payment(userId: string, paymentId: string, dateTime: string): SuccessionEvent {
  return {
    type: 'verified-payment', atMs: at(dateTime), userId, paymentId,
    amount: 3000, currency: 'KRW', method: '카드', status: 'DONE',
  };
}

function cConfirmedAfterBExpired(): SuccessionState {
  const requested = reduceSuccession(vacant(), {
    type: 'vacancy', atMs: at('2026-10-12T14:05:00'),
  });
  const expired = reduceSuccession(requested.state, {
    type: 'tick', atMs: at('2026-10-12T14:15:00'),
  });
  return reduceSuccession(expired.state,
    payment('C', 'payment-C', '2026-10-12T14:16:00')).state;
}

describe('리뷰 P1 / T-33·T-34 — 다음 후보 확정 후 이전 후보의 늦은 승인', () => {
  it('AC-11-3 / B 만료 → C 확정 → B DONE — B 3,000원 환불 요청과 C 예약 보존', () => {
    // GIVEN: B의 10분 기회가 만료되고 C의 카드 DONE이 먼저 확인되었다.
    const state = cConfirmedAfterBExpired();
    expect(state.confirmed?.userId).toBe('C');
    expect(state.expiredOffers.map((offer) => offer.userId)).toEqual(['B']);
    // WHEN: 그 뒤 B의 늦은 DONE이 처음 도착한다.
    const result = reduceSuccession(state,
      payment('B', 'late-B', '2026-10-12T14:17:00'));
    // THEN: 환불 요청을 내고, 이미 확정된 C나 대기 기회를 변경하지 않는다.
    expect(result.effects).toEqual([{ type: 'refund', paymentId: 'late-B', amount: 3000 }]);
    expect(result.state).toEqual({ ...state, refundRequestedPaymentIds: ['late-B'] });
  });

  it('AC-11-3·AC-05-4 / C 확정 후 B DONE 반복 — B 환불 요청은 한 번', () => {
    const state = cConfirmedAfterBExpired();
    const first = reduceSuccession(state,
      payment('B', 'late-B', '2026-10-12T14:17:00'));
    const repeated = reduceSuccession(first.state,
      payment('B', 'late-B', '2026-10-12T14:18:00'));
    expect([...first.effects, ...repeated.effects])
      .toEqual([{ type: 'refund', paymentId: 'late-B', amount: 3000 }]);
    expect(first.state.refundRequestedPaymentIds).toEqual(['late-B']);
    expect(repeated.state).toEqual(first.state);
    expect(repeated.effects).toEqual([]);
    expect(repeated.state.confirmed).toEqual(state.confirmed);
  });
});

function bConfirmedBeforeStart(requestedAt: string, confirmedAt: string): SuccessionState {
  const requested = reduceSuccession(vacant(), { type: 'vacancy', atMs: at(requestedAt) });
  return reduceSuccession(requested.state, payment('B', 'payment-B', confirmedAt)).state;
}

function earlyNoShowState(): NoShowState {
  const state = bConfirmedBeforeStart('2026-10-11T09:55:00', '2026-10-11T10:00:00');
  const confirmed = state.confirmed;
  if (confirmed === null) throw new Error('GIVEN: 시작 전 B 승계 확정이 필요합니다');
  return {
    reservationId: 'reservation-B',
    originalStartMs: confirmed.originalStartMs,
    originalEndMs: confirmed.originalEndMs,
    successionConfirmedAtMs: confirmed.confirmedAtMs,
    status: 'confirmed', cancellationReason: null,
    noShowCount: 0, refundAmount: 0, activeReservationCount: 1,
  };
}

describe('리뷰 P2 / C-02·T-35·T-36 — 시작 전 승계의 원래 시작 기준 체크인 기한', () => {
  it.each([
    { label: '전날 확정', requestedAt: '2026-10-11T09:55:00', confirmedAt: '2026-10-11T10:00:00' },
    { label: '시작 1ms 전 확정', requestedAt: '2026-10-12T13:55:00', confirmedAt: '2026-10-12T13:59:59.999' },
  ])('AC-08-5 / $label — 체크인 기한은 원래 시작 +15분', ({ requestedAt, confirmedAt }) => {
    const result = bConfirmedBeforeStart(requestedAt, confirmedAt);
    expect(result.confirmed).toEqual({
      userId: 'B', confirmedAtMs: at(confirmedAt),
      originalStartMs: at('2026-10-12T14:00:00'),
      originalEndMs: at('2026-10-12T15:30:00'),
      checkInDeadlineMs: at('2026-10-12T14:15:00'),
    });
  });

  it.each([
    { label: '확정 +15분', now: '2026-10-11T10:15:00' },
    { label: '원래 시작 -10분', now: '2026-10-12T13:50:00' },
    { label: '원래 시작 +15분 직전', now: '2026-10-12T14:14:59.999' },
  ])('AC-08-5 / $label — 노쇼 취소·승계 요청 없이 예약 유지', ({ now }) => {
    const state = earlyNoShowState();
    const result = reduceNoShow(state, { type: 'tick', atMs: at(now) });
    expect(result.state).toEqual(state);
    expect(result.effects).toEqual([]);
  });

  it.each(['2026-10-12T14:15:00.000', '2026-10-12T14:15:00.001'])(
    'AC-08-5·AC-11-6·AC-16-3 / %s — 노쇼 취소·환불 0원·제한 해제는 한 번', (now) => {
      const state = earlyNoShowState();
      const first = reduceNoShow(state, { type: 'tick', atMs: at(now) });
      expect(first.state).toEqual({
        ...state, status: 'cancelled', cancellationReason: 'no-show',
        noShowCount: 1, refundAmount: 0, activeReservationCount: 0,
      });
      expect(first.effects).toEqual([{ type: 'request-succession', reservationId: 'reservation-B' }]);
      const repeated = reduceNoShow(first.state, { type: 'tick', atMs: at(now) });
      expect(repeated.state).toEqual(first.state);
      expect(repeated.effects).toEqual([]);
    },
  );
});
