import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// US-11·US-16 / T-26·T-32~T-36·T-41의 순수 규칙 계약 제안.
// src/rules/succession.ts의 reduceSuccession(state, event)를 대상으로 한다.
// 저장·화면·권한·실제 결제/환불 호출은 검증하지 않는다.
// 모든 후보는 사전 자격 검사 통과·진행 예약 없음, 신청 시각은 서로 다르다.
// C-04: 정확히 10분의 승계 요청 만료는 미정이다. 직전/직후만 검증한다.
// C-01·C-02·C-03·C-06·C-07·C-09의 미정 정책은 기대값으로 추가하지 않는다.
// 특히 승인 시 잔여 30분 미만, 미래 승계, 동률, 경합·시계 복구는 제외한다.
// 검출할 회귀: 노쇼 경계 포함 오류, 체크인 보호 누락, FIFO 오류,
// 결제 요청을 확정으로 처리, 기한 연장, 종료 연장, 중복 노쇼/요청,
// 승계 기한을 원래 시작으로 계산, 운영자 취소 후 승계 또는 대기 유지.

interface Reservation {
  id: string;
  userId: string;
  charger: { statId: string; chgerId: string };
  originalStartMs: number;
  endMs: number;
  confirmedAtMs: number;
  predecessorId: string | null;
  status: 'confirmed' | 'checked-in' | 'cancelled';
  cancellationReason: null | 'user' | 'operator' | 'no-show';
  refundAmount: number;
}

interface Waiter {
  id: string;
  userId: string;
  charger: Reservation['charger'];
  originalStartMs: number;
  endMs: number;
  appliedAtMs: number;
}

interface PaymentRequest {
  waiterId: string;
  requestedAtMs: number;
  expiresAtMs: number;
  amount: number;
  active: boolean;
}

interface State {
  reservations: Reservation[];
  waiters: Waiter[];
  paymentRequests: PaymentRequest[];
  noShowReservationIds: string[];
  cancelledWaiterIds: string[];
}

type Event =
  | { type: 'tick'; atMs: number }
  | { type: 'user-cancel' | 'operator-cancel' | 'check-in'; reservationId: string; atMs: number }
  // 주문·카드 DONE·금액·자리 확보 검사를 통과한 승인 결과만 입력한다.
  | { type: 'payment-approved'; waiterId: string; reservationId: string; atMs: number; amount: 3000 };

type Effect =
  | { type: 'request-payment'; waiterId: string; amount: number; expiresAtMs: number }
  | { type: 'refund'; reservationId: string; amount: number };
type Result = { state: State; effects: Effect[] };
type ReduceSuccession = (state: State, event: Event) => Result;

function seoul(time: string): number {
  return Date.parse(`2026-10-06T${time}+09:00`);
}

async function reduce(state: State, event: Event): Promise<Result> {
  // 기존 결제 테스트와 같은 로더: 수집 오류 대신 각 AC에서 구현 부재를 표시한다.
  // 대상 함수의 대역·구현 스텁·조건부 skip은 사용하지 않는다.
  const url = new URL('../../src/rules/succession.ts', import.meta.url);
  expect(existsSync(url), 'src/rules/succession.ts가 아직 구현되지 않았습니다').toBe(true);
  const module = await import(url.href) as Record<string, unknown>;
  expect(module.reduceSuccession, 'reduceSuccession 함수가 아직 공개되지 않았습니다').toBeTypeOf('function');
  return (module.reduceSuccession as ReduceSuccession)(state, event);
}

function fixture(end = '15:30:00'): State {
  const charger = { statId: 'demo-station', chgerId: '01' };
  const originalStartMs = seoul('14:00:00');
  const endMs = seoul(end);
  return {
    reservations: [{ id: 'original', userId: 'driver-A', charger,
      originalStartMs, endMs, confirmedAtMs: seoul('12:00:00'), predecessorId: null,
      status: 'confirmed', cancellationReason: null, refundAmount: 0 }],
    // 배열 순서와 신청 순서를 다르게 해 실제 신청 시각 FIFO를 검증한다.
    waiters: [
      { id: 'wait-C', userId: 'driver-C', charger, originalStartMs, endMs, appliedAtMs: seoul('10:00:01') },
      { id: 'wait-B', userId: 'driver-B', charger, originalStartMs, endMs, appliedAtMs: seoul('10:00:00') },
    ],
    paymentRequests: [], noShowReservationIds: [], cancelledWaiterIds: [],
  };
}

function reservation(state: State, id = 'original'): Reservation {
  const row = state.reservations.find((item) => item.id === id);
  expect(row, `예약 ${id}가 보존되어야 합니다`).toBeDefined();
  return row!;
}

function activeRequests(state: State): PaymentRequest[] {
  return state.paymentRequests.filter((item) => item.active);
}

function expectRequest(result: Result, waiterId: string, requestedAt: string, expiresAt: string): void {
  expect(activeRequests(result.state)).toEqual([{
    waiterId, requestedAtMs: seoul(requestedAt), expiresAtMs: seoul(expiresAt), amount: 3000, active: true,
  }]);
  expect(result.effects.filter((effect) => effect.type === 'request-payment')).toEqual([
    { type: 'request-payment', waiterId, amount: 3000, expiresAtMs: seoul(expiresAt) },
  ]);
}

async function noShowRequest(end = '15:30:00'): Promise<Result> {
  return reduce(fixture(end), { type: 'tick', atMs: seoul('14:15:00') });
}

async function confirmedSuccessor(end = '15:30:00', confirmedAt = '14:20:00'): Promise<Result> {
  const offered = await noShowRequest(end);
  return reduce(offered.state, { type: 'payment-approved', waiterId: 'wait-B',
    reservationId: 'successor-B', atMs: seoul(confirmedAt), amount: 3000 });
}

describe('US-16 — 일반 예약 노쇼 자동 취소', () => {
  it.each(['14:14:59', '14:14:59.999'])('AC-16-1 / %s에는 노쇼·승계 요청이 없다', async (time) => {
    // GIVEN 미체크인 확정 예약 / WHEN 기한 직전 / THEN 예약과 대기 유지.
    const state = fixture();
    const result = await reduce(state, { type: 'tick', atMs: seoul(time) });
    expect(result.state).toEqual(state);
    expect(result.effects).toEqual([]);
  });

  it('AC-16-1 / 정확히 시작 +15분에 노쇼 취소·환불 0원으로 진행 예약에서 제외한다', async () => {
    const result = await noShowRequest();
    expect(reservation(result.state)).toMatchObject({ status: 'cancelled', cancellationReason: 'no-show', refundAmount: 0 });
    expect(result.state.reservations.filter((row) => row.userId === 'driver-A' && row.status !== 'cancelled')).toEqual([]);
    expect(result.state.noShowReservationIds).toEqual(['original']);
    expect(result.effects.filter((effect) => effect.type === 'refund')).toEqual([]);
  });

  it('AC-16-2 / 14:14:59에 체크인한 예약은 14:15:01에도 보호한다', async () => {
    const state = fixture();
    state.reservations[0]!.status = 'checked-in';
    const result = await reduce(state, { type: 'tick', atMs: seoul('14:15:01') });
    expect(result.state).toEqual(state);
    expect(result.effects).toEqual([]);
  });

  it('AC-16-3 / 노쇼 뒤 신청 시각이 가장 빠른 B에게만 3,000원 결제를 요청한다', async () => {
    const result = await noShowRequest();
    expectRequest(result, 'wait-B', '14:15:00', '14:25:00');
    expect(result.state.reservations).toHaveLength(1); // 결제 요청은 승계 확정이 아니다.
  });

  it('AC-16-3 / 같은 기한을 반복 처리해도 노쇼와 결제 요청은 각각 한 건이다', async () => {
    const first = await noShowRequest();
    const repeated = await reduce(first.state, { type: 'tick', atMs: seoul('14:15:00') });
    expect(repeated.state).toEqual(first.state);
    expect(repeated.state.noShowReservationIds).toEqual(['original']);
    expect(activeRequests(repeated.state)).toHaveLength(1);
    expect(repeated.effects).toEqual([]);
  });
});

describe('US-07 — 승계와 무관한 사용자 취소', () => {
  it('AC-07-3·AC-03-3 / 대기자가 없는 30분 예약은 시작 후 5분에도 취소·환불 0원·진행 제한 해제가 가능하다', async () => {
    const state = fixture('14:30:00');
    state.waiters = [];
    const before = structuredClone(state);

    const result = await reduce(state, {
      type: 'user-cancel', reservationId: 'original', atMs: seoul('14:05:00'),
    });

    expect(reservation(result.state)).toMatchObject({
      status: 'cancelled', cancellationReason: 'user', refundAmount: 0,
    });
    expect(result.state.reservations.filter((row) => row.userId === 'driver-A'
      && row.status !== 'cancelled')).toEqual([]);
    expect(result.state.noShowReservationIds).toEqual([]);
    expect(activeRequests(result.state)).toEqual([]);
    expect(result.effects).toEqual([]);
    expect(state).toEqual(before);
  });
});

describe('US-11 — 결제 기회와 승계 확정', () => {
  it('AC-11-1 / 사용자 취소 뒤에도 첫 대기자에게만 요청하며 아직 확정하지 않는다', async () => {
    const result = await reduce(fixture(), { type: 'user-cancel', reservationId: 'original', atMs: seoul('14:05:00') });
    expect(reservation(result.state)).toMatchObject({ status: 'cancelled', cancellationReason: 'user', refundAmount: 0 });
    expectRequest(result, 'wait-B', '14:05:00', '14:15:00');
    expect(result.state.reservations).toHaveLength(1);
    expect(result.state.noShowReservationIds).toEqual([]);
  });

  it('AC-11-2 / 요청 후 9분 59초에 승인되면 별도 승계 예약을 확정한다', async () => {
    const offered = await reduce(fixture(), { type: 'user-cancel', reservationId: 'original', atMs: seoul('14:05:00') });
    const result = await reduce(offered.state, { type: 'payment-approved', waiterId: 'wait-B',
      reservationId: 'successor-B', atMs: seoul('14:14:59'), amount: 3000 });
    expect(result.state.reservations).toHaveLength(2);
    expect(reservation(result.state, 'successor-B')).toMatchObject({ userId: 'driver-B', status: 'confirmed',
      predecessorId: 'original', confirmedAtMs: seoul('14:14:59'),
      originalStartMs: seoul('14:00:00'), endMs: seoul('15:30:00') });
    expect(activeRequests(result.state)).toEqual([]);
    expect(result.effects.filter((effect) => effect.type === 'request-payment')).toEqual([]);
  });

  it('AC-11-3 확정 부분 / 10분 직전에는 B의 기회를 유지하고 기한을 연장하지 않는다', async () => {
    const offered = await noShowRequest();
    const result = await reduce(offered.state, { type: 'tick', atMs: seoul('14:24:59.999') });
    expect(result.state).toEqual(offered.state);
    expect(result.effects).toEqual([]);
  });

  it('AC-11-3 확정 부분 / 10분 경과 후 미결제 B를 만료하고 C에게 새 10분 기회를 준다', async () => {
    const offered = await noShowRequest();
    const result = await reduce(offered.state, { type: 'tick', atMs: seoul('14:25:01') });
    expect(result.state.paymentRequests.find((row) => row.waiterId === 'wait-B')).toMatchObject({ active: false, expiresAtMs: seoul('14:25:00') });
    expectRequest(result, 'wait-C', '14:25:01', '14:35:01');
    expect(result.state.reservations).toHaveLength(1);
    const repeated = await reduce(result.state, { type: 'tick', atMs: seoul('14:25:01') });
    expect(repeated.state).toEqual(result.state);
    expect(repeated.effects).toEqual([]);
  });

  it('AC-11-4 / 노쇼 후 잔여 15분이면 대기자가 있어도 승계 요청하지 않는다', async () => {
    const result = await noShowRequest('14:30:00');
    expect(reservation(result.state)).toMatchObject({ status: 'cancelled', cancellationReason: 'no-show', refundAmount: 0 });
    expect(activeRequests(result.state)).toEqual([]);
    expect(result.effects).toEqual([]);
  });

  it('AC-11-4 / 노쇼 후 잔여 45분이면 첫 대기자에게 요청한다', async () => {
    expectRequest(await noShowRequest('15:00:00'), 'wait-B', '14:15:00', '14:25:00');
  });

  it('AC-11-5 / 14:20 승계·체크인 뒤에도 종료는 15:00이며 15:20으로 연장하지 않는다', async () => {
    const confirmed = await confirmedSuccessor('15:00:00');
    const result = await reduce(confirmed.state, { type: 'check-in', reservationId: 'successor-B', atMs: seoul('14:20:00') });
    expect(reservation(result.state, 'successor-B')).toMatchObject({ status: 'checked-in',
      originalStartMs: seoul('14:00:00'), endMs: seoul('15:00:00') });
  });
});

describe('승계 확정 시각부터 15분 체크인·재노쇼', () => {
  it('AC-08-4·AC-11-6 / 원래 노쇼 기한을 지났어도 승계 기한 직전에는 자동 취소하지 않는다', async () => {
    const confirmed = await confirmedSuccessor();
    const result = await reduce(confirmed.state, { type: 'tick', atMs: seoul('14:34:59.999') });
    expect(result.state).toEqual(confirmed.state);
    expect(result.effects).toEqual([]);
  });

  it.each(['14:34:59', '14:34:59.999'])('AC-08-4 / 14:20 확정 승계자는 %s에 체크인할 수 있다', async (time) => {
    const confirmed = await confirmedSuccessor();
    const result = await reduce(confirmed.state, { type: 'check-in', reservationId: 'successor-B', atMs: seoul(time) });
    expect(reservation(result.state, 'successor-B')).toMatchObject({ status: 'checked-in', cancellationReason: null });
    expect(result.state.noShowReservationIds).toEqual(['original']);
  });

  it('AC-08-4 / 정확히 확정 +15분의 체크인 시도는 거절되고 노쇼로 취소한다', async () => {
    const confirmed = await confirmedSuccessor();
    const result = await reduce(confirmed.state, { type: 'check-in', reservationId: 'successor-B', atMs: seoul('14:35:00') });
    expect(reservation(result.state, 'successor-B')).toMatchObject({ status: 'cancelled', cancellationReason: 'no-show', refundAmount: 0 });
    expect(result.state.noShowReservationIds).toEqual(['original', 'successor-B']);
  });

  it('AC-11-6 / 정확히 14:35에 승계자를 재노쇼 처리하고 잔여 55분을 C에게 요청한다', async () => {
    const confirmed = await confirmedSuccessor();
    const result = await reduce(confirmed.state, { type: 'tick', atMs: seoul('14:35:00') });
    expect(reservation(result.state, 'successor-B')).toMatchObject({ status: 'cancelled', cancellationReason: 'no-show', refundAmount: 0, endMs: seoul('15:30:00') });
    expect(result.state.noShowReservationIds).toEqual(['original', 'successor-B']);
    expectRequest(result, 'wait-C', '14:35:00', '14:45:00');
    expect(result.effects.filter((effect) => effect.type === 'refund')).toEqual([]);
  });

  it.each([
    ['14:15:00', '14:30:00', true],
    ['14:15:00.001', '14:30:00.001', false],
    ['14:15:01', '14:30:01', false],
  ] as const)('AC-11-4·AC-11-6 / 종료 15:00·승계 확정 %s·기한 %s의 다음 승계 허용=%s', async (confirmedAt, deadline, allowed) => {
    // 유효한 원래 60분 예약의 승계자 노쇼로 정확히 30분/직후를 만든다.
    const confirmed = await confirmedSuccessor('15:00:00', confirmedAt);
    const result = await reduce(confirmed.state, { type: 'tick', atMs: seoul(deadline) });
    expect(reservation(result.state, 'successor-B')).toMatchObject({ status: 'cancelled', cancellationReason: 'no-show', refundAmount: 0 });
    expect(activeRequests(result.state).map((row) => row.waiterId)).toEqual(allowed ? ['wait-C'] : []);
    expect(result.effects.filter((effect) => effect.type === 'request-payment')).toHaveLength(allowed ? 1 : 0);
  });
});

describe('운영자 취소 — 승계 금지·연결 대기 취소', () => {
  it('AC-12-1·AC-15-1 / 운영자 취소는 전액 환불 요청·연결 대기 취소이며 승계하지 않는다', async () => {
    const state = fixture();
    // 같은 충전기의 다음 구간 예약과 그 대기는 별도로 유지한다.
    const other: Reservation = { ...state.reservations[0]!, id: 'other', userId: 'other-driver',
      originalStartMs: seoul('15:30:00'), endMs: seoul('16:00:00') };
    const otherWaiter: Waiter = { ...state.waiters[0]!, id: 'other-wait', userId: 'other-waiter',
      originalStartMs: seoul('15:30:00'), endMs: seoul('16:00:00') };
    state.reservations.push(other);
    state.waiters.push(otherWaiter);
    const result = await reduce(state, { type: 'operator-cancel', reservationId: 'original', atMs: seoul('14:05:00') });
    expect(reservation(result.state)).toMatchObject({ status: 'cancelled', cancellationReason: 'operator', refundAmount: 3000 });
    expect([...result.state.cancelledWaiterIds].sort()).toEqual(['wait-B', 'wait-C']);
    expect(activeRequests(result.state)).toEqual([]);
    expect(result.state.noShowReservationIds).toEqual([]);
    expect(result.effects).toEqual([{ type: 'refund', reservationId: 'original', amount: 3000 }]);
    expect(reservation(result.state, 'other')).toEqual(other);
    expect(result.state.waiters.find((row) => row.id === 'other-wait')).toEqual(otherWaiter);
  });

  it('AC-15-2 / 운영자 취소를 반복해도 추가 환불·대기 취소·승계를 생성하지 않는다', async () => {
    const first = await reduce(fixture(), { type: 'operator-cancel', reservationId: 'original', atMs: seoul('14:05:00') });
    const repeated = await reduce(first.state, { type: 'operator-cancel', reservationId: 'original', atMs: seoul('14:05:00') });
    expect(repeated.state).toEqual(first.state);
    expect(repeated.effects).toEqual([]);
  });
});
