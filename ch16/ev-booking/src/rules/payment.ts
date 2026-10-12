/** T-50에서 사용하는 정규화된 검증 결과. 실제 토스 조회는 호출자 영역이다. */
export interface Payment {
  readonly paymentKey: string;
  readonly orderId: string;
  readonly totalAmount: number;
  readonly currency: string;
  readonly method: string;
  readonly status: string;
  readonly approvedAt: string;
}

/** 소유자·예약 자격·커넥터·사용자당 1건 검사를 통과한 일반 예약 주문. */
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

export interface PaymentApprovalRequest {
  readonly orderId: string;
  readonly amount: number;
}

export interface PaymentNotification {
  readonly eventType: string;
  readonly createdAt: string;
  readonly data: Payment;
}

export interface PaymentEffect {
  readonly type: 'confirm-reservation' | 'request-refund';
  readonly paymentKey: string;
  readonly amountKrw: number;
}

export interface PaymentResult {
  readonly state: PaymentState;
  readonly effects: readonly PaymentEffect[];
}

const DEPOSIT_KRW = 3000;

/** AC-05-7: 클라이언트 금액 대신 서버 저장 주문의 KRW 정수 금액을 기준으로 한다. */
export function validatePaymentApprovalRequest(
  state: PaymentState,
  request: PaymentApprovalRequest,
): boolean {
  return state.currency === 'KRW'
    && Number.isInteger(state.amountKrw)
    && state.amountKrw === DEPOSIT_KRW
    && request.orderId === state.orderId
    && Number.isInteger(request.amount)
    && request.amount === state.amountKrw;
}

/**
 * AC-05-2~9: 승인 반영과 확정·환불 요청만 반환한다.
 * nowMs는 호출자가 전달한 시연용 epoch milliseconds이며 외부 approvedAt과 별개다.
 * 환불 요청은 환불 성공이 아니며 재시도·외부 호출은 처리하지 않는다.
 */
export function reduceVerifiedPaymentApproval(
  state: PaymentState,
  payment: Payment,
  nowMs: number,
): PaymentResult {
  // AC-05-4·8: 이미 반영한 결과는 기한 후 재전달되어도 유지한다.
  if (state.processedPaymentKeys.includes(payment.paymentKey)) {
    return { state, effects: [] };
  }

  if (!validatePaymentApprovalRequest(state, {
    orderId: payment.orderId,
    amount: payment.totalAmount,
  })
    || payment.currency !== state.currency
    || payment.method !== '카드'
    || payment.status !== 'DONE') {
    return { state, effects: [] };
  }

  // 정확히 만료 시각부터 늦은 승인이다. 외부 승인 시각으로 점유를 복원하지 않는다.
  const confirm = nowMs < state.expiresAtMs && state.slotAvailable;

  return {
    state: {
      ...state,
      processedPaymentKeys: [...state.processedPaymentKeys, payment.paymentKey],
      chargedAmountKrw: state.chargedAmountKrw + state.amountKrw,
      reservationCount: state.reservationCount + (confirm ? 1 : 0),
      refundRequestedAmountKrw: state.refundRequestedAmountKrw
        + (confirm ? 0 : state.amountKrw),
    },
    effects: [{
      type: confirm ? 'confirm-reservation' : 'request-refund',
      paymentKey: payment.paymentKey,
      amountKrw: state.amountKrw,
    }],
  };
}

/** AC-05-11: 웹훅 본문 대신 검증된 조회 결과에 승인과 같은 규칙을 적용한다. */
export function reduceVerifiedPaymentWebhook(
  state: PaymentState,
  event: PaymentNotification,
  verifiedPaymentOrNull: Payment | null,
  nowMs: number,
): PaymentResult {
  if (event.eventType !== 'PAYMENT_STATUS_CHANGED' || verifiedPaymentOrNull === null) {
    return { state, effects: [] };
  }
  return reduceVerifiedPaymentApproval(state, verifiedPaymentOrNull, nowMs);
}
