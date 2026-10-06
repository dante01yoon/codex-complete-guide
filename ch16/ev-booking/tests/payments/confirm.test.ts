import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { blockNetwork, expectNoReservation, expectOneReservation, fixture, loadFunction,
  payment, request, seoul, type Confirm } from './fixtures.js';

// 검출할 회귀: 금액 검사 누락, DONE 외 완료, 만료 경계 오류, 중복 반영, 환불 재시도 초과.
beforeEach(blockNetwork);
afterEach(() => { vi.unstubAllGlobals(); });

async function confirm(...args: Parameters<Confirm>) {
  const fn = await loadFunction<Confirm>('confirm', 'confirmPayment');
  return fn(...args);
}

describe('T-16·T-17·T-19 — 결제 승인 (토스 테스트 대역)', () => {
  it('AC-05-2·AC-05-9 / 10:09:59 카드 3,000원 DONE이면 예약 1건 확정', async () => {
    const f = fixture();
    await confirm(request, f.dependencies);
    expect(f.toss.confirm).toHaveBeenCalledWith(request, expect.any(String));
    expectOneReservation(f);
    expect(f.toss.refund).not.toHaveBeenCalled();
  });

  it.each([1500, 6000, 3000.5])('AC-05-7 / 금액 %s는 승인 호출 없이 거절', async (amount) => {
    const f = fixture();
    await confirm({ ...request, amount }, f.dependencies);
    expect(f.toss.confirm).not.toHaveBeenCalled();
    expectNoReservation(f);
    expect(f.payments).toEqual([]);
    expect(f.orders.get('order-001')?.amount).toBe(3000);
  });

  it.each(['IN_PROGRESS', 'WAITING_FOR_DEPOSIT', 'ABORTED', 'EXPIRED'])('AC-05-6·AC-05-9 / 응답 상태 %s는 결제 완료·확정 아님', async (status) => {
    const f = fixture();
    f.toss.confirm.mockResolvedValue(payment({ status }));
    await confirm(request, f.dependencies);
    expectNoReservation(f);
    expect(f.payments).toEqual([]);
    expect(f.toss.refund).not.toHaveBeenCalled();
  });

  it('AC-05-7 / 승인 응답 금액이 1,500원이면 확정하지 않음', async () => {
    const f = fixture();
    f.toss.confirm.mockResolvedValue(payment({ totalAmount: 1500 }));
    await confirm(request, f.dependencies);
    expectNoReservation(f);
    expect(f.payments).toEqual([]);
  });

  it('AC-05-9 / 카드 외 결제수단의 DONE 응답은 확정하지 않음', async () => {
    const f = fixture();
    f.toss.confirm.mockResolvedValue(payment({ method: '가상계좌' }));
    await confirm(request, f.dependencies);
    expectNoReservation(f);
    expect(f.payments).toEqual([]);
  });

  it('AC-05-6·AC-05-8 / 시연 시계가 멈춰도 토스 인증 기한 만료 오류는 미확정', async () => {
    const f = fixture();
    f.clock.realNow = seoul('09:10:01');
    // 외부 인증은 실제 09:00 완료. 만료된 토스 응답만 모의한다.
    // 클라이언트 supplied timestamp로 자체 승인 기한을 정하는 정책은 추가하지 않는다.
    f.toss.confirm.mockRejectedValue({ code: 'NOT_FOUND_PAYMENT_SESSION' });
    await confirm(request, f.dependencies);
    expect(f.toss.confirm).toHaveBeenCalledTimes(1);
    expect(f.clock.policyNow).toBe(seoul('10:09:59'));
    expectNoReservation(f);
    expect(f.payments).toEqual([]);
    expect(f.toss.refund).not.toHaveBeenCalled();
  });

  it.each(['10:10:00', '10:10:01'])('AC-05-3·AC-05-10 / 승인 응답 도착 %s이면 예약 없이 전액 환불', async (arrival) => {
    const f = fixture();
    f.toss.confirm.mockImplementation(async () => {
      f.clock.policyNow = seoul(arrival); // 승인 응답 대기 중 점유 기한 도달.
      return payment();
    });
    await confirm(request, f.dependencies);
    expectNoReservation(f);
    expect(f.toss.refund).toHaveBeenCalledWith('fake-payment-001', 3000, expect.any(String));
    expect(f.toss.refund).toHaveBeenCalledTimes(1);
    expect(f.orders.get('order-001')?.refundedAmount).toBe(3000);
  });

  it('AC-05-5 / 승인 후 자리 확보 실패는 예약 없이 3,000원 환불', async () => {
    const f = fixture();
    f.dependencies.canReserve = async () => false;
    await confirm(request, f.dependencies);
    expectNoReservation(f);
    expect(f.toss.refund).toHaveBeenCalledWith('fake-payment-001', 3000, expect.any(String));
    expect(f.orders.get('order-001')?.refundedAmount).toBe(3000);
  });

  it('AC-05-5 / DONE 승인 후 예약 생성이 실패해도 예약 없이 3,000원 전액 환불한다', async () => {
    const f = fixture();
    // 사전 자격 검사는 통과하지만 실제 자리 확보 단계에서 실패한다.
    const insertReservation = vi.fn(async () => { throw new Error('자리 확보 실패'); });
    f.dependencies.repository.insertReservation = insertReservation;

    await expect(confirm(request, f.dependencies)).resolves.toEqual({ status: 'refunded' });

    expect(f.toss.confirm).toHaveBeenCalledTimes(1);
    expect(insertReservation).toHaveBeenCalledTimes(1);
    expectNoReservation(f);
    expect(f.toss.refund).toHaveBeenCalledTimes(1);
    expect(f.toss.refund).toHaveBeenCalledWith('fake-payment-001', 3000, expect.any(String));
    expect(f.orders.get('order-001')?.refundedAmount).toBe(3000);
  });

  it('AC-05-11 / 최초 요청과 재시도 3회 실패 후 운영자 확인 필요', async () => {
    const f = fixture();
    f.dependencies.canReserve = async () => false;
    f.toss.refund.mockRejectedValue({ code: 'PROVIDER_ERROR' });
    await confirm(request, f.dependencies);
    expect(f.toss.refund).toHaveBeenCalledTimes(4);
    const keys = f.toss.refund.mock.calls.map((call) => call[2]);
    expect(keys.every((key) => key.length > 0)).toBe(true);
    expect(new Set(keys).size).toBe(1);
    expect(f.orders.get('order-001')).toMatchObject({
      confirmed: false, refundAttempts: 4, refundedAmount: 0, operatorReviewRequired: true,
    });
    expectNoReservation(f);
  });

  it('AC-05-11 / 첫 재시도 성공이면 2회에서 멈추고 3,000원만 반영', async () => {
    const f = fixture();
    f.dependencies.canReserve = async () => false;
    f.toss.refund.mockRejectedValueOnce({ code: 'PROVIDER_ERROR' });
    await confirm(request, f.dependencies);
    expect(f.toss.refund).toHaveBeenCalledTimes(2);
    expect(f.orders.get('order-001')).toMatchObject({ refundedAmount: 3000, operatorReviewRequired: false });
    expectNoReservation(f);
  });

  it('AC-05-4 / 동일 승인 요청 두 번에도 승인 호출·예약·결제 반영 각 1회', async () => {
    const f = fixture();
    await confirm(request, f.dependencies);
    await confirm(request, f.dependencies);
    expect(f.toss.confirm).toHaveBeenCalledTimes(1);
    expectOneReservation(f);
  });
});
