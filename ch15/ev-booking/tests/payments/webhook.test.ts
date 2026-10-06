import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { blockNetwork, event, expectNoReservation, expectOneReservation, fixture, loadFunction,
  payment, request, seoul, type Confirm, type HandleWebhook } from './fixtures.js';

// 검출할 회귀: 동일 결제 재전달·동시 전달 중복, 금액 덮어쓰기, 늦은 승인 중복 환불.
beforeEach(blockNetwork);
afterEach(() => { vi.unstubAllGlobals(); });

async function webhook(...args: Parameters<HandleWebhook>) {
  const fn = await loadFunction<HandleWebhook>('webhook', 'handlePaymentWebhook');
  return fn(...args);
}

describe('T-16·T-17 — PAYMENT_STATUS_CHANGED 웹훅 (토스 조회 대역)', () => {
  it('AC-05-4·AC-05-12 / 같은 웹훅 두 번에도 예약 한 번만 확정', async () => {
    const f = fixture();
    await webhook(event, f.dependencies);
    await webhook(event, f.dependencies);
    expectOneReservation(f);
    expect(f.toss.confirm).not.toHaveBeenCalled();
  });

  it('AC-05-4·AC-05-12 / 같은 웹훅 동시 수신에도 예약 1건·3,000원', async () => {
    const f = fixture();
    await Promise.all([webhook(event, f.dependencies), webhook(event, f.dependencies)]);
    expectOneReservation(f);
    expect(f.toss.confirm).not.toHaveBeenCalled();
  });

  it('AC-05-12 / 승인 응답 처리 후 웹훅이 와도 중복 확정 없음', async () => {
    const f = fixture();
    const confirm = await loadFunction<Confirm>('confirm', 'confirmPayment');
    await confirm(request, f.dependencies);
    await webhook(event, f.dependencies);
    expectOneReservation(f);
    expect(f.toss.confirm).toHaveBeenCalledTimes(1);
  });

  it('AC-05-12 / 웹훅 처리 후 승인 결과 재확인에도 중복 확정 없음', async () => {
    const f = fixture();
    const confirm = await loadFunction<Confirm>('confirm', 'confirmPayment');
    await webhook(event, f.dependencies);
    await confirm(request, f.dependencies);
    expectOneReservation(f);
    expect(f.toss.confirm).not.toHaveBeenCalled();
  });

  it('AC-05-7·AC-05-12 / 웹훅과 조회 금액이 1,500원이면 승인·확정하지 않음', async () => {
    const f = fixture();
    f.toss.getPayment.mockResolvedValue(payment({ totalAmount: 1500 }));
    await webhook({ ...event, data: payment({ totalAmount: 1500 }) }, f.dependencies);
    expect(f.toss.confirm).not.toHaveBeenCalled();
    expectNoReservation(f);
    expect(f.payments).toEqual([]);
    expect(f.orders.get('order-001')?.amount).toBe(3000);
  });

  it('AC-05-7 / 웹훅 금액이 3,000원이어도 서버 조회 금액 불일치면 확정하지 않음', async () => {
    const f = fixture();
    f.toss.getPayment.mockResolvedValue(payment({ totalAmount: 1500 }));
    await webhook(event, f.dependencies);
    expect(f.toss.getPayment).toHaveBeenCalledWith('fake-payment-001');
    expectNoReservation(f);
    expect(f.payments).toEqual([]);
    expect(f.toss.confirm).not.toHaveBeenCalled();
  });

  it.each(['IN_PROGRESS', 'EXPIRED'])('AC-05-6·AC-05-9·AC-05-12 / 상태 %s는 미확정', async (status) => {
    const f = fixture();
    f.toss.getPayment.mockResolvedValue(payment({ status }));
    await webhook({ ...event, data: payment({ status }) }, f.dependencies);
    expectNoReservation(f);
    expect(f.payments).toEqual([]);
    expect(f.toss.confirm).not.toHaveBeenCalled();
  });

  it('AC-05-9 / 카드 외 DONE 웹훅은 예약 확정으로 반영하지 않음', async () => {
    const f = fixture();
    f.toss.getPayment.mockResolvedValue(payment({ method: '가상계좌' }));
    await webhook({ ...event, data: payment({ method: '가상계좌' }) }, f.dependencies);
    expectNoReservation(f);
    expect(f.payments).toEqual([]);
    expect(f.toss.confirm).not.toHaveBeenCalled();
  });

  it('AC-05-10·AC-05-12 / 만료 후 DONE 웹훅 두 번에도 환불 한 번만', async () => {
    const f = fixture();
    f.clock.policyNow = seoul('10:10:01');
    await webhook(event, f.dependencies);
    await webhook(event, f.dependencies);
    expectNoReservation(f);
    expect(f.toss.confirm).not.toHaveBeenCalled();
    expect(f.toss.refund).toHaveBeenCalledTimes(1);
    expect(f.toss.refund).toHaveBeenCalledWith('fake-payment-001', 3000, expect.any(String));
    expect(f.orders.get('order-001')?.refundedAmount).toBe(3000);
  });

  it('AC-05-11·AC-05-12 / 웹훅 재전달로 환불 재시도 한도를 초기화하지 않음', async () => {
    const f = fixture();
    f.clock.policyNow = seoul('10:10:01');
    f.toss.refund.mockRejectedValue({ code: 'PROVIDER_ERROR' });
    await webhook(event, f.dependencies);
    await webhook(event, f.dependencies);
    expectNoReservation(f);
    expect(f.toss.refund).toHaveBeenCalledTimes(4);
    expect(f.orders.get('order-001')).toMatchObject({
      refundAttempts: 4, refundedAmount: 0, operatorReviewRequired: true,
    });
  });

  it('AC-05-5·AC-05-12·AC-06-1 / 환불 성공 후 저장 실패·롤백이 발생해도 웹훅 재전달로 환불 기록을 복구한다', async () => {
    const f = fixture();
    const confirm = await loadFunction<Confirm>('confirm', 'confirmPayment');
    f.dependencies.canReserve = async () => false;

    // 외부 결제 상태는 로컬 저장 트랜잭션의 롤백 대상이 아니다.
    let externalStatus = 'DONE';
    f.toss.getPayment.mockImplementation(async () => payment({ status: externalStatus }));
    f.toss.refund.mockImplementation(async () => {
      externalStatus = 'CANCELED';
      return { refundedAmount: 3000 };
    });

    const saveOrder = f.dependencies.repository.saveOrder;
    let failRefundSave = true;
    f.dependencies.repository.saveOrder = async (order) => {
      if (order.refundedAmount === 3000 && failRefundSave) {
        failRefundSave = false;
        throw new Error('환불 완료 기록 저장 실패');
      }
      await saveOrder(order);
    };
    const transaction = f.dependencies.repository.transaction;
    f.dependencies.repository.transaction = (operation) => transaction(async () => {
      const orders = [...f.orders.entries()].map(([id, order]) => [id, { ...order }] as const);
      const reservations = f.reservations.map((row) => ({ ...row }));
      const payments = f.payments.map((row) => ({ ...row }));
      try {
        return await operation();
      } catch (error) {
        f.orders.clear();
        for (const [id, order] of orders) f.orders.set(id, order);
        f.reservations.splice(0, f.reservations.length, ...reservations);
        f.payments.splice(0, f.payments.length, ...payments);
        throw error;
      }
    });

    // 첫 처리의 예외 형식은 고정하지 않고 재전달 후 복구 결과를 검증한다.
    await confirm(request, f.dependencies).catch(() => undefined);
    expect(f.toss.refund).toHaveBeenCalledTimes(1);
    expect(externalStatus).toBe('CANCELED');
    expectNoReservation(f);

    const refundedEvent = { ...event, data: payment({ status: 'CANCELED' }) };
    await expect(webhook(refundedEvent, f.dependencies)).resolves.toEqual({ status: 'refunded' });
    expect(f.orders.get('order-001')).toMatchObject({
      confirmed: false, refundedAmount: 3000, operatorReviewRequired: false,
    });
    await expect(webhook(refundedEvent, f.dependencies)).resolves.toEqual({ status: 'refunded' });
    expect(f.toss.refund).toHaveBeenCalledTimes(1);
    expectNoReservation(f);
  });
});
