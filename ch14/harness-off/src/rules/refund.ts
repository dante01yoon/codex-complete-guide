export interface CancellationState {
  readonly reservationId: string;
  readonly originalStartMs: number;
  readonly confirmedAtMs: number;
  readonly depositAmount: number;
  readonly status: 'confirmed' | 'cancelled';
  readonly cancellationReason: null | 'user';
  readonly refundAmount: number;
  readonly refundedAmount: number;
}

export type CancellationEvent =
  | { readonly type: 'cancel'; readonly atMs: number }
  | { readonly type: 'refund-succeeded'; readonly amount: number };

export type CancellationEffect =
  | { readonly type: 'refund'; readonly amount: number }
  | { readonly type: 'request-succession' };

export interface CancellationResult {
  readonly state: CancellationState;
  readonly effects: readonly CancellationEffect[];
}

const MINUTE_MS = 60_000;

/** AC-07-1~3, 5: 승계 확정 시각과 관계없이 원래 시작 시각을 기준으로 계산한다. */
function cancellationRefund(originalStartMs: number, atMs: number): number {
  const remainingMs = originalStartMs - atMs;
  if (remainingMs >= 120 * MINUTE_MS) return 3000;
  if (remainingMs >= 30 * MINUTE_MS) return 1500;
  return 0;
}

/**
 * 소유자 확인·3,000원 결제가 완료되고 노쇼·종료 전인 예약을 처리한다.
 * 환불과 승계는 실행 요청만 반환한다. 외부 호출과 실패 재시도는 호출자 영역이다.
 */
export function reduceUserCancellation(
  state: CancellationState,
  event: CancellationEvent,
): CancellationResult {
  if (event.type === 'refund-succeeded') {
    // 이번 취소에서 요청한 환불의 성공 결과만 한 번 반영한다.
    if (state.status !== 'cancelled'
      || state.cancellationReason !== 'user'
      || event.amount !== state.refundAmount
      || state.refundedAmount >= state.refundAmount) {
      return { state, effects: [] };
    }
    return {
      state: { ...state, refundedAmount: state.refundAmount },
      effects: [],
    };
  }

  // AC-07-4: 반복 취소는 최초 금액을 유지하고 부수 효과를 다시 요청하지 않는다.
  if (state.status === 'cancelled') return { state, effects: [] };

  const refundAmount = cancellationRefund(state.originalStartMs, event.atMs);
  const effects: CancellationEffect[] = [];
  if (refundAmount > 0) effects.push({ type: 'refund', amount: refundAmount });
  effects.push({ type: 'request-succession' });

  return {
    state: {
      ...state,
      status: 'cancelled',
      cancellationReason: 'user',
      refundAmount,
    },
    effects,
  };
}
