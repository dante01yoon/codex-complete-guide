import { existsSync } from 'node:fs';
import { expect, vi } from 'vitest';

// 검토할 공개 함수·의존성 계약. 실제 승인/확정/환불/중복 판정은 대역에 구현하지 않는다.
// Payment 전체 HTTP 응답이 아닌 결제 어댑터가 제공하는 최소 결과 모델이다.
export interface Payment {
  paymentKey: string;
  orderId: string;
  totalAmount: number;
  method: string;
  status: string;
}

export interface Order {
  orderId: string;
  userId: string;
  amount: number;
  holdExpiresAt: number;
  confirmed: boolean;
  refundAttempts: number;
  refundedAmount: number;
  operatorReviewRequired: boolean;
}

export interface ConfirmRequest {
  paymentKey: string;
  orderId: string;
  amount: number;
  userId: string;
}

export const request: ConfirmRequest = {
  paymentKey: 'fake-payment-001', orderId: 'order-001', amount: 3000, userId: 'driver-001',
};

export function seoul(time: string): number {
  return Date.parse(`2026-10-06T${time}+09:00`);
}

export function payment(overrides: Partial<Payment> = {}): Payment {
  return { paymentKey: 'fake-payment-001', orderId: 'order-001',
    totalAmount: 3000, method: '카드', status: 'DONE', ...overrides };
}

export interface Webhook {
  eventType: string;
  createdAt: string;
  data: Payment;
}

export const event: Webhook = {
  eventType: 'PAYMENT_STATUS_CHANGED', createdAt: '2026-10-06T10:09:59.000000', data: payment(),
};

export function fixture() {
  const orders = new Map<string, Order>([['order-001', {
    orderId: 'order-001', userId: 'driver-001', amount: 3000,
    holdExpiresAt: seoul('10:10:00'), confirmed: false,
    refundAttempts: 0, refundedAmount: 0, operatorReviewRequired: false,
  }]]);
  const reservations: { orderId: string; paymentKey: string }[] = [];
  const payments: { paymentKey: string; amount: number }[] = [];
  const clock = { policyNow: seoul('10:09:59'), realNow: seoul('09:00:00') };
  const toss = {
    confirm: vi.fn(async (_request: ConfirmRequest, _idempotencyKey: string): Promise<Payment> => payment()),
    getPayment: vi.fn(async (_paymentKey: string): Promise<Payment> => payment()),
    refund: vi.fn(async (_paymentKey: string, _amount: number, _idempotencyKey: string) => ({ refundedAmount: 3000 })),
  };
  let transactionTail: Promise<unknown> = Promise.resolve();
  const dependencies = {
    toss,
    policyNow: () => clock.policyNow,
    realNow: () => clock.realNow,
    repository: {
      // 단순 저장·배제 처리만 제공한다. 주문 상태 판정과 중복 제거는 대상 구현의 책임이다.
      getOrder: async (id: string) => {
        const order = orders.get(id);
        return order ? { ...order } : undefined;
      },
      saveOrder: async (order: Order) => { orders.set(order.orderId, { ...order }); },
      insertReservation: async (row: { orderId: string; paymentKey: string }) => { reservations.push({ ...row }); },
      recordPayment: async (row: { paymentKey: string; amount: number }) => { payments.push({ ...row }); },
      transaction: <T>(operation: () => Promise<T>): Promise<T> => {
        const result = transactionTail.then(operation);
        transactionTail = result.then(() => undefined, () => undefined);
        return result;
      },
    },
    // 선행 모듈의 예약 자격·1건 제한·구간 확보 결과를 주입하며 규칙을 복제하지 않는다.
    canReserve: async (_order: Order) => true,
  };
  return { orders, reservations, payments, clock, toss, dependencies };
}

export type Dependencies = ReturnType<typeof fixture>['dependencies'];
// 거절·API 오류는 처리 결과로 반환한다. 본 테스트는 기록과 부수 효과를 검증한다.
export type Confirm = (input: ConfirmRequest, dependencies: Dependencies) => Promise<unknown>;
export type HandleWebhook = (input: Webhook, dependencies: Dependencies) => Promise<unknown>;

export async function loadFunction<T>(name: 'confirm' | 'webhook', exportName: string): Promise<T> {
  const url = new URL(`../../src/payments/${name}.ts`, import.meta.url);
  // 모듈 수집 오류 대신 각 AC 테스트 안에서 대상 구현의 부재를 명시한다.
  // 대상 함수 대역·항상 실패하는 구현 스텁·조건부 skip은 사용하지 않는다.
  expect(existsSync(url), `src/payments/${name}.ts가 아직 구현되지 않았습니다`).toBe(true);
  const module = await import(url.href) as Record<string, unknown>;
  expect(module[exportName], `${exportName} 함수가 아직 공개되지 않았습니다`).toBeTypeOf('function');
  return module[exportName] as T;
}

export function blockNetwork(): void {
  vi.stubGlobal('fetch', vi.fn(() => { throw new Error('결제 단위 테스트의 네트워크 호출은 금지됩니다'); }));
}

export function expectOneReservation(f: ReturnType<typeof fixture>): void {
  expect(f.reservations).toEqual([{ orderId: 'order-001', paymentKey: 'fake-payment-001' }]);
  expect(f.payments).toEqual([{ paymentKey: 'fake-payment-001', amount: 3000 }]);
  expect(f.orders.get('order-001')?.confirmed).toBe(true);
}

export function expectNoReservation(f: ReturnType<typeof fixture>): void {
  expect(f.reservations).toEqual([]);
  expect(f.orders.get('order-001')?.confirmed).toBe(false);
}
