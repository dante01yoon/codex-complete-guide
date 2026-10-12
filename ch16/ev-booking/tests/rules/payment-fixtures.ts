import { expect } from 'vitest';
import * as rules from '../../src/rules/index.js';

// T-50 내부 순수 함수 계약. 전체 토스 SDK 객체가 아니라 필요한 필드의 정규화 결과다.
// HTTP·인증키·저장·사용자 권한·실제 환불은 이 계약의 대상 밖이다.
export interface Payment {
  readonly paymentKey: string;
  readonly orderId: string;
  readonly totalAmount: number;
  readonly currency: string;
  readonly method: string;
  readonly status: string;
  readonly approvedAt: string;
}
export interface PaymentState {
  readonly orderId: string;
  readonly amountKrw: number;
  readonly currency: string;
  readonly expiresAtMs: number;
  readonly slotAvailable: boolean;
  readonly processedPaymentKeys: readonly string[];
  readonly reservationCount: number;
  readonly chargedAmountKrw: number;
  readonly refundRequestedAmountKrw: number;
  readonly refundedAmountKrw: number;
}
export interface PaymentResult {
  readonly state: PaymentState;
  readonly effects: readonly {
    readonly type: 'confirm-reservation' | 'request-refund';
    readonly paymentKey: string;
    readonly amountKrw: number;
  }[];
}
export interface Notification {
  readonly eventType: string;
  readonly createdAt: string;
  readonly data: Payment;
}
type ValidateRequest = (state: PaymentState, request: { orderId: string; amount: number }) => boolean;
type ApprovalRule = (state: PaymentState, payment: Payment, nowMs: number) => PaymentResult;
type WebhookRule = (state: PaymentState, event: Notification, verified: Payment | null, nowMs: number) => PaymentResult;

function rule<T>(name: string): T {
  const exported = rules as unknown as Record<string, unknown>;
  expect(exported[name], `${name} 순수 규칙이 미구현·미공개입니다`).toBeTypeOf('function');
  return exported[name] as T;
}
export const validateRequest = (state: PaymentState, orderId: string, amount: number): boolean =>
  rule<ValidateRequest>('validatePaymentApprovalRequest')(state, { orderId, amount });
export const approve = (state: PaymentState, payment: Payment, nowMs: number): PaymentResult =>
  rule<ApprovalRule>('reduceVerifiedPaymentApproval')(state, payment, nowMs);
export const webhook = (state: PaymentState, event: Notification, verified: Payment | null, nowMs: number): PaymentResult =>
  rule<WebhookRule>('reduceVerifiedPaymentWebhook')(state, event, verified, nowMs);

export function initialState(overrides: Partial<PaymentState> = {}): PaymentState {
  // 예약 자격·소유자·사용자당 1건 검사는 통과한 일반 예약만 대상으로 한다.
  return {
    orderId: 'order_demo_001', amountKrw: 3000, currency: 'KRW',
    expiresAtMs: Date.parse('2026-10-11T10:10:00+09:00'), slotAvailable: true,
    processedPaymentKeys: [], reservationCount: 0, chargedAmountKrw: 0,
    refundRequestedAmountKrw: 0, refundedAmountKrw: 0, ...overrides,
  };
}
export function cardPayment(overrides: Partial<Payment> = {}): Payment {
  return {
    paymentKey: 'payment_demo_001', orderId: 'order_demo_001', totalAmount: 3000,
    currency: 'KRW', method: '카드', status: 'DONE',
    approvedAt: '2026-10-11T10:09:00+09:00', ...overrides,
  };
}
export function notification(overrides: Partial<Notification> = {}): Notification {
  return {
    eventType: 'PAYMENT_STATUS_CHANGED', createdAt: '2026-10-11T10:09:00.000000',
    data: cardPayment(), ...overrides,
  };
}
export const BEFORE = Date.parse('2026-10-11T10:09:59.999+09:00');
export const EXACT = Date.parse('2026-10-11T10:10:00.000+09:00');
export const AFTER = Date.parse('2026-10-11T10:10:00.001+09:00');
export const MUCH_LATER = Date.parse('2026-10-11T11:00:00+09:00');

// 금액과 효과는 AC에서 손으로 정한 리터럴이다. 구현으로 기대값을 계산하지 않는다.
export function expectConfirmed(result: PaymentResult): void {
  expect(result.effects).toEqual([
    { type: 'confirm-reservation', paymentKey: 'payment_demo_001', amountKrw: 3000 },
  ]);
  expect(result.state).toMatchObject({
    reservationCount: 1, chargedAmountKrw: 3000,
    refundRequestedAmountKrw: 0, refundedAmountKrw: 0,
    processedPaymentKeys: ['payment_demo_001'],
  });
}
export function expectRefundRequested(result: PaymentResult): void {
  expect(result.effects).toEqual([
    { type: 'request-refund', paymentKey: 'payment_demo_001', amountKrw: 3000 },
  ]);
  expect(result.state).toMatchObject({
    reservationCount: 0, chargedAmountKrw: 3000,
    refundRequestedAmountKrw: 3000, refundedAmountKrw: 0,
    processedPaymentKeys: ['payment_demo_001'],
  });
}
