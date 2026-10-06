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
  paymentKey?: string;
}

export interface ConfirmRequest {
  paymentKey: string;
  orderId: string;
  amount: number;
  userId: string;
}

export interface Dependencies {
  toss: {
    confirm(input: ConfirmRequest, idempotencyKey: string): Promise<Payment>;
    getPayment(paymentKey: string): Promise<Payment>;
    refund(paymentKey: string, amount: number, idempotencyKey: string): Promise<{ refundedAmount: number }>;
  };
  policyNow(): number;
  realNow(): number;
  repository: {
    getOrder(orderId: string): Promise<Order | undefined>;
    saveOrder(order: Order): Promise<void>;
    insertReservation(row: { orderId: string; paymentKey: string }): Promise<void>;
    recordPayment(row: { paymentKey: string; amount: number }): Promise<void>;
    transaction<T>(operation: () => Promise<T>): Promise<T>;
  };
  canReserve(order: Order): Promise<boolean>;
}

export type PaymentResult = {
  status: 'rejected' | 'unconfirmed' | 'confirmed' | 'refunded' | 'operator_review_required';
};

const DEPOSIT = 3000;

export function validOrderAmount(amount: number): boolean {
  return Number.isInteger(amount) && amount === DEPOSIT;
}

export function existingResult(order: Order): PaymentResult | undefined {
  if (order.confirmed) return { status: 'confirmed' };
  if (order.refundedAmount === DEPOSIT) return { status: 'refunded' };
  if (order.operatorReviewRequired || order.refundAttempts >= 4) {
    return { status: 'operator_review_required' };
  }
  return undefined;
}

// Both entry points call this inside the same repository transaction. Reservation
// eligibility and interval rules remain in the injected reservation module.
export async function applyPayment(
  payment: Payment,
  order: Order,
  paymentKey: string,
  dependencies: Dependencies,
): Promise<PaymentResult> {
  if (payment.paymentKey !== paymentKey || payment.orderId !== order.orderId ||
      !validOrderAmount(order.amount) || payment.totalAmount !== order.amount ||
      !Number.isInteger(payment.totalAmount)) {
    return { status: 'rejected' };
  }
  if (payment.method !== '카드') {
    return { status: 'unconfirmed' };
  }
  if (order.paymentKey && order.paymentKey !== paymentKey) return { status: 'rejected' };
  // A provider-confirmed full cancellation survives a local transaction rollback.
  // Reconcile it without issuing another refund or creating a reservation.
  if (payment.status === 'CANCELED' && !order.confirmed) {
    if (!order.paymentKey) {
      order.paymentKey = paymentKey;
      await dependencies.repository.recordPayment({ paymentKey, amount: order.amount });
    }
    order.refundedAmount = DEPOSIT;
    order.operatorReviewRequired = false;
    await dependencies.repository.saveOrder(order);
    return { status: 'refunded' };
  }
  if (payment.status !== 'DONE') return { status: 'unconfirmed' };
  const previous = existingResult(order);
  if (previous) return previous;

  if (!order.paymentKey) {
    order.paymentKey = paymentKey;
    await dependencies.repository.recordPayment({ paymentKey, amount: order.amount });
    await dependencies.repository.saveOrder(order);
  }

  const eligible = dependencies.policyNow() < order.holdExpiresAt &&
    await dependencies.canReserve(order);
  // Check again after the asynchronous reservation check, at confirmation time.
  if (order.refundAttempts === 0 && eligible && dependencies.policyNow() < order.holdExpiresAt) {
    let inserted = false;
    try {
      await dependencies.repository.insertReservation({ orderId: order.orderId, paymentKey });
      inserted = true;
    } catch {
      // Approval already succeeded: failed seat acquisition needs compensation.
    }
    if (inserted) {
      order.confirmed = true;
      await dependencies.repository.saveOrder(order);
      return { status: 'confirmed' };
    }
  }

  const refundKey = `refund:${order.orderId}:${paymentKey}`;
  while (order.refundAttempts < 4) {
    order.refundAttempts += 1;
    await dependencies.repository.saveOrder(order);
    let refunded: { refundedAmount: number };
    try {
      refunded = await dependencies.toss.refund(paymentKey, DEPOSIT, refundKey);
    } catch {
      continue;
    }
    if (refunded.refundedAmount !== DEPOSIT) continue;
    order.refundedAmount = DEPOSIT;
    order.operatorReviewRequired = false;
    await dependencies.repository.saveOrder(order);
    return { status: 'refunded' };
  }
  order.operatorReviewRequired = true;
  await dependencies.repository.saveOrder(order);
  return { status: 'operator_review_required' };
}

export async function confirmPayment(
  input: ConfirmRequest,
  dependencies: Dependencies,
): Promise<PaymentResult> {
  return dependencies.repository.transaction(async () => {
    const order = await dependencies.repository.getOrder(input.orderId);
    if (!order || order.userId !== input.userId || !input.paymentKey ||
        !validOrderAmount(order.amount) || !validOrderAmount(input.amount) ||
        input.amount !== order.amount || (order.paymentKey && order.paymentKey !== input.paymentKey)) {
      return { status: 'rejected' };
    }
    const previous = existingResult(order);
    if (previous) return previous;
    let payment: Payment;
    try {
      // Authentication expiry is enforced by the provider's real clock, never
      // inferred from a client timestamp or the demonstration policy clock.
      payment = await dependencies.toss.confirm(input, `confirm:${input.orderId}:${input.paymentKey}`);
    } catch {
      return { status: 'unconfirmed' };
    }
    return applyPayment(payment, order, input.paymentKey, dependencies);
  });
}
