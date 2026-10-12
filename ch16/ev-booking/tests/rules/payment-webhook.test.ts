import { describe, expect, it } from 'vitest';
import {
  AFTER, BEFORE, EXACT, MUCH_LATER, approve, cardPayment, expectConfirmed,
  expectRefundRequested, initialState, notification, webhook,
} from './payment-fixtures.js';

// T-50: PAYMENT_STATUS_CHANGED의 검증된 결과 판정만 테스트한다.
// 검증된 결과는 서버 조회를 대신하는 로컬 fixture다. 실제 조회·HTTP·서명 검사 없음.
describe('US-05 / 웹훅 완료 검증', () => {
  // 잡는 오류: 본문 DONE만 신뢰하거나 최신 조회 결과를 무시하는 분기.
  it('AC-05-11 / 검증된 조회 결과가 없으면 본문 DONE으로 확정하지 않는다', () => {
    const input = initialState();
    expect(webhook(input, notification(), null, BEFORE)).toEqual({ state: input, effects: [] });
  });
  it.each(['IN_PROGRESS', 'CANCELED', 'EXPIRED'])
  ('AC-05-9·11 / 본문 DONE이어도 검증된 상태가 %s이면 확정하지 않는다', (status) => {
    const input = initialState();
    expect(webhook(input, notification(), cardPayment({ status }), BEFORE)).toEqual({ state: input, effects: [] });
  });
  it.each([{ totalAmount: 100 }, { orderId: 'order_demo_other' }, { currency: 'USD' }, { method: '가상계좌' }])
  ('AC-05-7·9·11 / 검증된 결제가 저장 주문·카드 조건과 불일치 %j이면 완료하지 않는다', (overrides) => {
    const input = initialState();
    expect(webhook(input, notification(), cardPayment(overrides), BEFORE)).toEqual({ state: input, effects: [] });
  });
  it('AC-05-2·9·11 / 검증된 카드 DONE과 기한 내 자리 확보로 확정한다', () => {
    expectConfirmed(webhook(initialState(), notification(), cardPayment(), BEFORE));
  });
  it('AC-05-8·11 / 외부 생성·승인 시각이 기한 전이어도 늦은 첫 확인은 전액 환불 요청', () => {
    expectRefundRequested(webhook(initialState(), notification(), cardPayment(), EXACT));
  });
  it('AC-05-5·11 / 기한 내 웹훅이어도 자리 확보 실패면 전액 환불 요청', () => {
    expectRefundRequested(webhook(initialState({ slotAvailable: false }), notification(), cardPayment(), BEFORE));
  });
});

describe('US-05 / 승인 응답과 웹훅의 중복 반영 보호', () => {
  // 잡는 오류: 채널마다 별도 중복 키 사용, 재전달 시 기한 재판정으로 확정 예약 환불.
  it.each(['approval-first', 'webhook-first'])
  ('AC-05-4·11 / %s 순서와 기한 이후 재전달에도 예약 1건·결제 3,000원 유지', (order) => {
    const first = order === 'approval-first'
      ? approve(initialState(), cardPayment(), BEFORE)
      : webhook(initialState(), notification(), cardPayment(), BEFORE);
    expectConfirmed(first);
    const second = order === 'approval-first'
      ? webhook(first.state, notification(), cardPayment(), AFTER)
      : approve(first.state, cardPayment(), AFTER);
    expect(second).toEqual({ state: first.state, effects: [] });
    expect(second.state).toMatchObject({ reservationCount: 1, chargedAmountKrw: 3000, refundRequestedAmountKrw: 0 });
  });
  it('AC-05-4·11 / 같은 웹훅을 다시 받아도 새 예약·환불을 만들지 않는다', () => {
    const first = webhook(initialState(), notification(), cardPayment(), BEFORE);
    expectConfirmed(first);
    expect(webhook(first.state, notification(), cardPayment(), BEFORE)).toEqual({ state: first.state, effects: [] });
  });
  it.each(['approval-first', 'webhook-first'])
  ('AC-05-4·8·11 / 늦은 승인 %s와 반복 웹훅은 예약 0건·환불 요청 1건 유지', (order) => {
    const first = order === 'approval-first'
      ? approve(initialState(), cardPayment(), EXACT)
      : webhook(initialState(), notification(), cardPayment(), EXACT);
    expectRefundRequested(first);
    expect(webhook(first.state, notification(), cardPayment(), MUCH_LATER))
      .toEqual({ state: first.state, effects: [] });
    expect(approve(first.state, cardPayment(), MUCH_LATER))
      .toEqual({ state: first.state, effects: [] });
  });
  it('AC-05-11 / 순수 웹훅 규칙은 전달된 상태·이벤트·조회 결과를 변경하지 않는다', () => {
    const input = initialState();
    const event = notification();
    const verified = cardPayment();
    const before = structuredClone({ input, event, verified });
    expectConfirmed(webhook(input, event, verified, BEFORE));
    expect({ input, event, verified }).toEqual(before);
  });
});
