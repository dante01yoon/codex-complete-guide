import { describe, expect, it } from 'vitest';
import * as rules from '../../src/rules/index.js';

// US-07 / T-22·T-23의 테스트용 공개 함수 계약. 구현과 저장 방식은 제공하지 않는다.
// 금액·시각 기대값은 docs/acceptance.md의 AC-07-1~5에서 독립적으로 작성한다.
// 순수 상태 전이와 부수 효과 요청을 검증한다. 화면·토스 실연결·실제 승계는 검증하지 않는다.
// 소유자 확인과 결제가 완료되고 노쇼·종료 처리 전인 예약을 입력한다.
interface CancellationState {
  readonly reservationId: string;
  readonly originalStartMs: number;
  readonly confirmedAtMs: number;
  readonly depositAmount: number;
  readonly status: 'confirmed' | 'cancelled';
  readonly cancellationReason: null | 'user';
  readonly refundAmount: number;
  readonly refundedAmount: number;
}

type CancellationEvent =
  | { readonly type: 'cancel'; readonly atMs: number }
  | { readonly type: 'refund-succeeded'; readonly amount: number };

type CancellationEffect =
  | { readonly type: 'refund'; readonly amount: number }
  | { readonly type: 'request-succession' };

interface CancellationResult {
  readonly state: CancellationState;
  readonly effects: readonly CancellationEffect[];
}

type CancellationReducer = (
  state: CancellationState,
  event: CancellationEvent,
) => CancellationResult;

function seoulTime(time: string): number {
  return Date.parse(`2026-10-06T${time}+09:00`);
}

function paidReservation(): CancellationState {
  return {
    reservationId: 'reservation-refund-07',
    originalStartMs: seoulTime('14:00:00'),
    confirmedAtMs: seoulTime('10:00:00'),
    depositAmount: 3000,
    status: 'confirmed',
    cancellationReason: null,
    refundAmount: 0,
    refundedAmount: 0,
  };
}

function reduceCancellation(
  state: CancellationState,
  event: CancellationEvent,
): CancellationResult {
  // 이름 공간 참조로 테스트 수집을 유지하고, 각 AC를 미구현 공개 함수 확인에서 실패시킨다.
  // 대체 구현·모의 함수·항상 실패하는 스텁을 넣지 않는다.
  const exported = rules as unknown as Record<string, unknown>;
  expect(
    exported.reduceUserCancellation,
    'src/rules/index.ts에 reduceUserCancellation이 미구현·미공개입니다',
  ).toBeTypeOf('function');
  return (exported.reduceUserCancellation as CancellationReducer)(state, event);
}

function expectCancellationAt(time: string, refundAmount: number): void {
  // GIVEN: 원래 시작 14:00, 결제 완료 3,000원, 노쇼·종료 처리 전.
  const reservation = paidReservation();
  // WHEN: 서울 시연용 시각에 본인이 취소한다.
  const result = reduceCancellation(reservation, { type: 'cancel', atMs: seoulTime(time) });
  // THEN: 사용자 취소를 기록하고 정확한 금액만 환불 요청한다.
  expect(result.state.status).toBe('cancelled');
  expect(result.state.cancellationReason).toBe('user');
  expect(result.state.refundAmount).toBe(refundAmount);
  expect(result.state.depositAmount - result.state.refundAmount).toBe(3000 - refundAmount);
  const refundEffects = result.effects.filter((effect) => effect.type === 'refund');
  expect(refundEffects).toEqual(refundAmount === 0 ? [] : [{ type: 'refund', amount: refundAmount }]);

  if (refundAmount > 0) {
    // 환불 성공 이벤트로 누적 반영도 검증한다. 외부 결제를 호출하지 않는다.
    const settled = reduceCancellation(result.state, { type: 'refund-succeeded', amount: refundAmount });
    expect(settled.state.refundedAmount).toBe(refundAmount);
    expect(settled.state.status).toBe('cancelled');
  } else {
    expect(result.state.refundedAmount).toBe(0);
  }
}

describe('US-07 — 사용자 취소와 환불 (서울 시연 시각)', () => {
  it('AC-07-1 / 11:59:59 — 시작 120분 1초 전에는 3,000원 전액 환불', () => {
    expectCancellationAt('11:59:59', 3000);
  });

  it('AC-07-1 / 12:00:00 — 정확히 시작 120분 전에는 3,000원 전액 환불', () => {
    expectCancellationAt('12:00:00', 3000);
  });

  it('AC-07-2 / 12:00:01 — 시작 120분 전을 1초 지나면 1,500원 환불', () => {
    expectCancellationAt('12:00:01', 1500);
  });

  it('AC-07-2 / 13:29:59 — 시작 30분 1초 전에는 1,500원 환불', () => {
    expectCancellationAt('13:29:59', 1500);
  });

  it('AC-07-2 / 13:30:00 — 정확히 시작 30분 전에는 1,500원 환불', () => {
    expectCancellationAt('13:30:00', 1500);
  });

  it('AC-07-3 / 13:30:01 — 시작 30분 전을 1초 지나면 환불 0원', () => {
    expectCancellationAt('13:30:01', 0);
  });

  it('AC-07-3 / 14:00:00 — 정확히 시작 시각에는 취소하고 환불 0원', () => {
    expectCancellationAt('14:00:00', 0);
  });

  it('AC-07-3 / 14:05:00 — 시작 5분 후에도 취소하고 환불 0원', () => {
    expectCancellationAt('14:05:00', 0);
  });

  it('AC-07-4 / 취소 요청 반복 — 누적 1,500원 유지, 추가 환불·승계 요청 없음', () => {
    // GIVEN: 같은 예약을 취소하여 1,500원 환불이 이미 성공했다.
    const settled: CancellationState = {
      ...paidReservation(), status: 'cancelled', cancellationReason: 'user',
      refundAmount: 1500, refundedAmount: 1500,
    };
    // WHEN: 취소 요청을 재전송한다. 다음 금액 구간에 도달해도 이전 결과를 유지한다.
    const repeated = reduceCancellation(settled, { type: 'cancel', atMs: seoulTime('13:30:01') });
    // THEN: 환불·대기자 요청을 추가하지 않고 누적 금액과 취소 상태를 유지한다.
    expect(repeated.state).toEqual(settled);
    expect(repeated.effects).toEqual([]);
  });

  it('AC-07-4 / 환불 성공 결과 반복 — 누적 1,500원 유지, 추가 환불·승계 요청 없음', () => {
    const settled: CancellationState = {
      ...paidReservation(), status: 'cancelled', cancellationReason: 'user',
      refundAmount: 1500, refundedAmount: 1500,
    };
    const repeated = reduceCancellation(settled, { type: 'refund-succeeded', amount: 1500 });
    expect(repeated.state).toEqual(settled);
    expect(repeated.effects).toEqual([]);
  });

  it('AC-07-4 / 최초 취소부터 반복까지 — 환불 요청과 대기자 승계 요청은 각각 1회', () => {
    const first = reduceCancellation(paidReservation(), { type: 'cancel', atMs: seoulTime('13:00:00') });
    const settled = reduceCancellation(first.state, { type: 'refund-succeeded', amount: 1500 });
    const repeatedCancel = reduceCancellation(settled.state, { type: 'cancel', atMs: seoulTime('13:00:01') });
    const repeatedSuccess = reduceCancellation(repeatedCancel.state, { type: 'refund-succeeded', amount: 1500 });
    const effects = [...first.effects, ...settled.effects, ...repeatedCancel.effects, ...repeatedSuccess.effects];
    // 대기자 승계 처리의 연결 요청만 센다. 후보 선택·결제·승계 확정은 실행하지 않는다.
    expect(effects.filter((effect) => effect.type === 'refund')).toEqual([{ type: 'refund', amount: 1500 }]);
    expect(effects.filter((effect) => effect.type === 'request-succession')).toHaveLength(1);
    expect(repeatedSuccess.state.refundedAmount).toBe(1500);
    expect(repeatedSuccess.state.refundAmount).toBe(1500);
    expect(repeatedSuccess.state.status).toBe('cancelled');
    expect(repeatedSuccess.state.cancellationReason).toBe('user');
  });

  it('AC-07-5 / 14:20:00 승계 확정·14:21:00 취소 — 원래 시작 14:00 기준 환불 0원', () => {
    const inherited: CancellationState = {
      ...paidReservation(), confirmedAtMs: seoulTime('14:20:00'),
    };
    const result = reduceCancellation(inherited, { type: 'cancel', atMs: seoulTime('14:21:00') });
    expect(result.state.originalStartMs).toBe(seoulTime('14:00:00'));
    expect(result.state.confirmedAtMs).toBe(seoulTime('14:20:00'));
    expect(result.state.status).toBe('cancelled');
    expect(result.state.cancellationReason).toBe('user');
    expect(result.state.refundAmount).toBe(0);
    expect(result.state.refundedAmount).toBe(0);
    expect(result.effects.filter((effect) => effect.type === 'refund')).toEqual([]);
  });
});
