import {
  applyPayment, existingResult, validOrderAmount,
  type Dependencies, type Payment, type PaymentResult,
} from './confirm.js';

export interface PaymentWebhook {
  eventType: string;
  createdAt: string;
  data: Payment;
}

export async function handlePaymentWebhook(
  input: PaymentWebhook,
  dependencies: Dependencies,
): Promise<PaymentResult> {
  if (input.eventType !== 'PAYMENT_STATUS_CHANGED' || !input.data?.paymentKey) {
    return { status: 'rejected' };
  }
  return dependencies.repository.transaction(async () => {
    const order = await dependencies.repository.getOrder(input.data.orderId);
    if (!order || !validOrderAmount(order.amount) ||
        (order.paymentKey && order.paymentKey !== input.data.paymentKey)) {
      return { status: 'rejected' };
    }
    const previous = existingResult(order);
    // Even an exhausted refund may have succeeded externally before local
    // persistence failed. Query the provider so a full cancellation can recover.
    if (previous && previous.status !== 'operator_review_required') return previous;
    let payment: Payment;
    try {
      // The webhook identifies a payment; only the server lookup is authoritative.
      payment = await dependencies.toss.getPayment(input.data.paymentKey);
    } catch {
      return { status: 'unconfirmed' };
    }
    return applyPayment(payment, order, input.data.paymentKey, dependencies);
  });
}
