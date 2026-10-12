export interface SuccessionCandidate {
  readonly userId: string;
  readonly appliedAtMs: number;
}

export interface SuccessionOffer {
  readonly userId: string;
  readonly requestedAtMs: number;
  readonly expiresAtMs: number;
  readonly amount: number;
}

export interface SuccessionState {
  readonly reservationId: string;
  readonly originalStartMs: number;
  readonly originalEndMs: number;
  readonly cancellationReason: 'user' | 'no-show';
  readonly candidates: readonly SuccessionCandidate[];
  readonly offer: SuccessionOffer | null;
  readonly expiredOffers: readonly SuccessionOffer[];
  readonly refundRequestedPaymentIds: readonly string[];
  readonly confirmed: null | {
    readonly userId: string;
    readonly confirmedAtMs: number;
    readonly originalStartMs: number;
    readonly originalEndMs: number;
    readonly checkInDeadlineMs: number;
  };
}

export type SuccessionEvent =
  | { readonly type: 'vacancy'; readonly atMs: number }
  | { readonly type: 'tick'; readonly atMs: number }
  | {
    readonly type: 'verified-payment';
    readonly atMs: number;
    readonly userId: string;
    readonly paymentId: string;
    readonly amount: number;
    readonly currency: 'KRW';
    readonly method: '카드';
    readonly status: 'DONE';
  };

export type SuccessionEffect =
  | { readonly type: 'request-payment'; readonly userId: string;
      readonly amount: number; readonly expiresAtMs: number }
  | { readonly type: 'refund'; readonly paymentId: string; readonly amount: number };

export interface SuccessionResult {
  readonly state: SuccessionState;
  readonly effects: readonly SuccessionEffect[];
}

const MINUTE_MS = 60_000;
const DEPOSIT_KRW = 3000;

function hasNoShowTime(state: SuccessionState, atMs: number): boolean {
  return state.originalEndMs - atMs >= 30 * MINUTE_MS;
}

/** 후보는 자격 충족·진행 예약 없음·서로 다른 신청 시각을 전제로 한다. */
function requestNext(state: SuccessionState, atMs: number): SuccessionResult {
  if (state.offer || state.confirmed
    || (state.cancellationReason === 'no-show' && !hasNoShowTime(state, atMs))) {
    return { state, effects: [] };
  }
  const candidate = state.candidates
    .filter((entry) => !state.expiredOffers.some((offer) => offer.userId === entry.userId))
    .reduce<SuccessionCandidate | null>((first, entry) =>
      first === null || entry.appliedAtMs < first.appliedAtMs ? entry : first, null);
  if (!candidate) return { state, effects: [] };

  const offer: SuccessionOffer = {
    userId: candidate.userId,
    requestedAtMs: atMs,
    expiresAtMs: atMs + 10 * MINUTE_MS,
    amount: DEPOSIT_KRW,
  };
  return {
    state: { ...state, offer },
    effects: [{ type: 'request-payment', userId: offer.userId,
      amount: offer.amount, expiresAtMs: offer.expiresAtMs }],
  };
}

function expireOffer(state: SuccessionState, atMs: number): SuccessionResult {
  if (!state.offer || atMs < state.offer.expiresAtMs) return { state, effects: [] };
  return requestNext({
    ...state,
    offer: null,
    expiredOffers: [...state.expiredOffers, state.offer],
  }, atMs);
}

/**
 * T-32~34: 검증된 카드·KRW·3,000원 DONE과 유효한 자리 확보를 입력의 전제로 한다.
 * 결제·환불 요청만 반환한다. C-03·06의 미정 후보는 입력 범위 밖이다.
 */
export function reduceSuccession(
  state: SuccessionState,
  event: SuccessionEvent,
): SuccessionResult {
  if (state.confirmed && event.type !== 'verified-payment') return { state, effects: [] };
  if (event.type === 'vacancy') return requestNext(state, event.atMs);
  if (event.type === 'tick') return expireOffer(state, event.atMs);

  if (state.refundRequestedPaymentIds.includes(event.paymentId)) {
    return { state, effects: [] };
  }
  const offer = state.offer?.userId === event.userId ? state.offer : null;
  const expiredOffer = state.expiredOffers.find((entry) => entry.userId === event.userId);
  // 다음 후보가 확정되어도 만료된 이전 후보의 늦은 승인 보상은 처리한다.
  if (state.confirmed && !expiredOffer) return { state, effects: [] };
  if (!offer && !expiredOffer) return { state, effects: [] };

  const late = !offer || event.atMs >= offer.expiresAtMs;
  const insufficientTime = state.cancellationReason === 'no-show'
    && (!hasNoShowTime(state, event.atMs)
      || (offer !== null && !hasNoShowTime(state, offer.requestedAtMs)));
  if (late || insufficientTime) {
    // 이전 후보의 늦은 승인은 현재 다른 후보의 결제 기회를 변경하지 않는다.
    const result = offer && late ? expireOffer(state, event.atMs) : { state, effects: [] };
    return {
      state: {
        ...result.state,
        refundRequestedPaymentIds: [...result.state.refundRequestedPaymentIds, event.paymentId],
      },
      effects: [...result.effects, { type: 'refund', paymentId: event.paymentId, amount: DEPOSIT_KRW }],
    };
  }

  return {
    state: {
      ...state,
      offer: null,
      confirmed: {
        userId: event.userId,
        confirmedAtMs: event.atMs,
        originalStartMs: state.originalStartMs,
        originalEndMs: state.originalEndMs,
        checkInDeadlineMs: Math.max(state.originalStartMs, event.atMs) + 15 * MINUTE_MS,
      },
    },
    effects: [],
  };
}
