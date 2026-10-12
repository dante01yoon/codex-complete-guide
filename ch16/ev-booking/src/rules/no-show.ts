export interface NoShowState {
  readonly reservationId: string;
  readonly originalStartMs: number;
  readonly originalEndMs: number;
  readonly successionConfirmedAtMs: number | null;
  readonly status: 'confirmed' | 'checked-in' | 'cancelled' | 'ended';
  readonly cancellationReason: null | 'user' | 'operator' | 'no-show';
  readonly noShowCount: number;
  readonly refundAmount: number;
  readonly activeReservationCount: number;
}

export interface NoShowResult {
  readonly state: NoShowState;
  readonly effects: readonly {
    readonly type: 'request-succession';
    readonly reservationId: string;
  }[];
}

/** T-26·T-36: 결제 완료 예약과 서울 시연용 epoch milliseconds를 입력받는다. */
export function reduceNoShow(
  state: NoShowState,
  event: { readonly type: 'tick'; readonly atMs: number },
): NoShowResult {
  // AC-08-5: 시작 전 승계는 원래 시작, 시작 후 승계는 확정 시각을 기준으로 한다.
  const deadlineMs = Math.max(
    state.originalStartMs,
    state.successionConfirmedAtMs ?? state.originalStartMs,
  ) + 15 * 60_000;
  // AC-16-1·2·3: 체크인 및 종료 상태를 보호하고 반복 전이를 막는다.
  if (state.status !== 'confirmed' || event.atMs < deadlineMs) {
    return { state, effects: [] };
  }
  return {
    state: {
      ...state,
      status: 'cancelled',
      cancellationReason: 'no-show',
      noShowCount: state.noShowCount + 1,
      refundAmount: 0,
      activeReservationCount: state.activeReservationCount - 1,
    },
    // 잔여시간·대기자 검사는 승계 규칙에서 수행한다. 여기서는 연결 요청만 반환한다.
    effects: [{ type: 'request-succession', reservationId: state.reservationId }],
  };
}
