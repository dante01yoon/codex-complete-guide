import { describe, expect, it } from 'vitest';
import {
  AFTER, BEFORE, EXACT, MUCH_LATER, approve, cardPayment, expectConfirmed,
  expectRefundRequested, initialState, validateRequest,
} from './payment-fixtures.js';

// T-50: 사용자 확인 전 실행하지 않는다. 구현 스텁·실제 토스 호출 없음.
describe('US-05 / 승인 전 주문 금액 검증', () => {
  // 잡는 오류: 화면·successUrl에서 함께 변조한 금액을 저장 금액보다 신뢰하는 분기.
  it.each([100, 0, -1, 3000.5, 6000, Number.NaN, Number.POSITIVE_INFINITY])
  ('AC-05-7 / 서버 저장 금액과 다른 값 %s원을 거절한다', (amount) => {
    expect(validateRequest(initialState(), 'order_demo_001', amount)).toBe(false);
  });
  it('AC-05-7 / 서버 주문의 KRW 정수 3,000원은 검증을 통과한다', () => {
    expect(validateRequest(initialState(), 'order_demo_001', 3000)).toBe(true);
  });
  it('AC-05-7 / 다른 주문으로 바꾼 승인 요청은 거절한다', () => {
    expect(validateRequest(initialState(), 'order_demo_other', 3000)).toBe(false);
  });
});

describe('US-05 / 승인 결과와 예약·보상 효과', () => {
  // 잡는 오류: 성공 응답만 신뢰, 10분 경계 포함, 외부 승인 시각으로 만료 점유 복원.
  it('AC-05-2·8·9 / 10:09:59.999 카드 DONE은 예약 1건·3,000원을 반영한다', () => {
    expectConfirmed(approve(initialState(), cardPayment(), BEFORE));
  });
  it.each([EXACT, AFTER, MUCH_LATER])
  ('AC-05-3·8 / 시연 시각 %s에 첫 승인 확인이면 빈 자리여도 예약 없이 전액 환불 요청', (nowMs) => {
    expectRefundRequested(approve(initialState(), cardPayment(), nowMs));
  });
  it('AC-05-5 / 기한 내 DONE이어도 자리 확보 실패면 예약 없이 전액 환불 요청', () => {
    expectRefundRequested(approve(initialState({ slotAvailable: false }), cardPayment(), BEFORE));
  });
  it.each(['READY', 'IN_PROGRESS', 'WAITING_FOR_DEPOSIT', 'CANCELED', 'PARTIAL_CANCELED', 'ABORTED', 'EXPIRED', 'UNKNOWN'])
  ('AC-05-6·9 / %s를 새 결제 완료로 반영하지 않는다', (status) => {
    const input = initialState();
    expect(approve(input, cardPayment({ status }), BEFORE)).toEqual({ state: input, effects: [] });
  });
  it.each(['가상계좌', '계좌이체', '간편결제', '휴대폰'])
  ('AC-05-9 / %s를 카드 완료로 수용하지 않는다', (method) => {
    const input = initialState();
    expect(approve(input, cardPayment({ method }), BEFORE)).toEqual({ state: input, effects: [] });
  });
  it.each([{ totalAmount: 100 }, { totalAmount: 3000.5 }, { currency: 'USD' }, { orderId: 'order_demo_other' }])
  ('AC-05-7·9 / 승인 결과의 주문·금액·통화 불일치 %j는 반영하지 않는다', (overrides) => {
    const input = initialState();
    expect(approve(input, cardPayment(overrides), BEFORE)).toEqual({ state: input, effects: [] });
  });
  it('AC-05-4 / 같은 승인을 반복해도 예약 1건·결제 3,000원을 유지한다', () => {
    const first = approve(initialState(), cardPayment(), BEFORE);
    expectConfirmed(first);
    const second = approve(first.state, cardPayment(), BEFORE);
    expect(second).toEqual({ state: first.state, effects: [] });
    expect(second.state).toMatchObject({ reservationCount: 1, chargedAmountKrw: 3000 });
  });
  it('AC-05-4·8 / 늦은 승인을 반복해도 전액 환불 요청은 한 번이다', () => {
    const first = approve(initialState(), cardPayment(), EXACT);
    expectRefundRequested(first);
    expect(approve(first.state, cardPayment(), MUCH_LATER)).toEqual({ state: first.state, effects: [] });
  });
  it('AC-05-2·4 / 순수 승인 규칙은 전달된 상태와 응답을 변경하지 않는다', () => {
    const input = initialState();
    const response = cardPayment();
    const before = structuredClone({ input, response });
    expectConfirmed(approve(input, response, BEFORE));
    expect({ input, response }).toEqual(before);
  });
});
