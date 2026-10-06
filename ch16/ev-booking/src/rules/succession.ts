import { canCheckInGeneralReservation } from './checkin.js';
import { reduceUserCancellation } from './refund.js';
import type { ChargerIdentity } from './types.js';

export interface SuccessionReservation {
  id: string;
  userId: string;
  charger: ChargerIdentity;
  originalStartMs: number;
  endMs: number;
  confirmedAtMs: number;
  predecessorId: string | null;
  status: 'confirmed' | 'checked-in' | 'cancelled';
  cancellationReason: null | 'user' | 'operator' | 'no-show';
  refundAmount: number;
}

export interface SuccessionWaiter {
  id: string;
  userId: string;
  charger: ChargerIdentity;
  originalStartMs: number;
  endMs: number;
  appliedAtMs: number;
}

export interface SuccessionPaymentRequest {
  waiterId: string;
  requestedAtMs: number;
  expiresAtMs: number;
  amount: number;
  active: boolean;
}

export interface SuccessionState {
  reservations: SuccessionReservation[];
  waiters: SuccessionWaiter[];
  paymentRequests: SuccessionPaymentRequest[];
  noShowReservationIds: string[];
  cancelledWaiterIds: string[];
}

export type SuccessionEvent =
  | { type: 'tick'; atMs: number }
  | { type: 'user-cancel' | 'operator-cancel' | 'check-in'; reservationId: string; atMs: number }
  | { type: 'payment-approved'; waiterId: string; reservationId: string; atMs: number; amount: 3000 };

export type SuccessionEffect =
  | { type: 'request-payment'; waiterId: string; amount: number; expiresAtMs: number }
  | { type: 'refund'; reservationId: string; amount: number };

export interface SuccessionResult {
  state: SuccessionState;
  effects: SuccessionEffect[];
}

const MINUTE_MS = 60_000;

function sameSlot(a: SuccessionWaiter | SuccessionReservation, b: SuccessionWaiter | SuccessionReservation): boolean {
  return a.charger.statId === b.charger.statId
    && a.charger.chgerId === b.charger.chgerId
    && a.originalStartMs === b.originalStartMs
    && a.endMs === b.endMs;
}

function checkInDeadline(row: SuccessionReservation): number {
  if (row.predecessorId !== null && row.confirmedAtMs < row.originalStartMs) {
    throw new Error('C-02: future succession check-in policy is unresolved');
  }
  return (row.predecessorId === null ? row.originalStartMs : row.confirmedAtMs) + 15 * MINUTE_MS;
}

/**
 * US-11·US-16 / T-26·T-32~36·T-41の確定範囲のみを処理する純粋関数。
 * 呼び出し元が権限・候補の資格・注文/カードDONE/金額・席確保を確認済みであること。
 * 時刻はシミュレーション時計のepoch milliseconds。副作用は要求として返し、外部APIは呼ばない。
 * 未確定の境界や候補競合は推測せず例外にする。入力状態は変更しない。
 */
export function reduceSuccession(input: SuccessionState, event: SuccessionEvent): SuccessionResult {
  const state: SuccessionState = {
    reservations: input.reservations.map((row) => ({ ...row })),
    waiters: input.waiters.map((row) => ({ ...row })),
    paymentRequests: input.paymentRequests.map((row) => ({ ...row })),
    noShowReservationIds: [...input.noShowReservationIds],
    cancelledWaiterIds: [...input.cancelledWaiterIds],
  };
  const effects: SuccessionEffect[] = [];

  function requestNext(source: SuccessionReservation): void {
    const linked = state.waiters.filter((row) => sameSlot(row, source));
    if (state.paymentRequests.some((request) => request.active
      && linked.some((row) => row.id === request.waiterId))) return;
    const candidates = linked.filter((row) => !state.cancelledWaiterIds.includes(row.id)
      && !state.paymentRequests.some((request) => request.waiterId === row.id))
      .sort((a, b) => a.appliedAtMs - b.appliedAtMs);
    const first = candidates[0];
    // No succession decision is needed when nobody is waiting for this slot.
    if (!first) return;
    if (source.endMs - event.atMs < 30 * MINUTE_MS) {
      if (source.cancellationReason === 'user') {
        throw new Error('C-01: minimum remaining time after user cancellation is unresolved');
      }
      return;
    }
    if (candidates[1]?.appliedAtMs === first.appliedAtMs) {
      throw new Error('C-06: equal application time ordering is unresolved');
    }
    if (state.reservations.some((row) => row.userId === first.userId && row.status !== 'cancelled')) {
      throw new Error('C-03: candidate with an ongoing reservation is unresolved');
    }
    const expiresAtMs = event.atMs + 10 * MINUTE_MS;
    state.paymentRequests.push({ waiterId: first.id, requestedAtMs: event.atMs,
      expiresAtMs, amount: 3000, active: true });
    effects.push({ type: 'request-payment', waiterId: first.id, amount: 3000, expiresAtMs });
  }

  function noShow(row: SuccessionReservation): void {
    row.status = 'cancelled';
    row.cancellationReason = 'no-show';
    row.refundAmount = 0;
    if (!state.noShowReservationIds.includes(row.id)) state.noShowReservationIds.push(row.id);
    requestNext(row);
  }

  if (event.type === 'tick') {
    for (const row of state.reservations) {
      if (row.status === 'confirmed' && event.atMs >= checkInDeadline(row)) noShow(row);
    }
    // 元のリクエストだけを対象にし、このイベントで作った機会を再処理しない。
    for (const original of input.paymentRequests) {
      if (!original.active) continue;
      if (event.atMs === original.expiresAtMs) {
        throw new Error('C-04: exact succession request expiration boundary is unresolved');
      }
      if (event.atMs < original.expiresAtMs) continue;
      const request = state.paymentRequests.find((row) => row.waiterId === original.waiterId);
      const waiter = state.waiters.find((row) => row.id === original.waiterId);
      if (!request?.active || !waiter) continue;
      request.active = false;
      const source = [...state.reservations].reverse().find((row) => sameSlot(row, waiter)
        && row.status === 'cancelled' && (row.cancellationReason === 'no-show' || row.cancellationReason === 'user'));
      if (source) requestNext(source);
    }
  } else if (event.type === 'payment-approved') {
    const request = state.paymentRequests.find((row) => row.waiterId === event.waiterId && row.active);
    const waiter = state.waiters.find((row) => row.id === event.waiterId);
    if (!request || !waiter || state.cancelledWaiterIds.includes(waiter.id)) return { state, effects };
    if (event.atMs >= request.expiresAtMs) {
      throw new Error('C-04: late succession approval policy is unresolved');
    }
    if (event.atMs < request.requestedAtMs || event.amount !== request.amount) return { state, effects };
    if (waiter.endMs - event.atMs < 30 * MINUTE_MS) {
      throw new Error('C-01: remaining time at approval is unresolved');
    }
    if (state.reservations.some((row) => row.id === event.reservationId)) return { state, effects };
    if (state.reservations.some((row) => row.userId === waiter.userId && row.status !== 'cancelled')) {
      throw new Error('C-03: candidate with an ongoing reservation is unresolved');
    }
    const predecessor = [...state.reservations].reverse().find((row) => sameSlot(row, waiter)
      && row.status === 'cancelled' && (row.cancellationReason === 'no-show' || row.cancellationReason === 'user'));
    if (!predecessor) return { state, effects };
    request.active = false;
    state.reservations.push({ id: event.reservationId, userId: waiter.userId,
      charger: { ...waiter.charger }, originalStartMs: waiter.originalStartMs, endMs: waiter.endMs,
      confirmedAtMs: event.atMs, predecessorId: predecessor.id, status: 'confirmed',
      cancellationReason: null, refundAmount: 0 });
  } else {
    const row = state.reservations.find((item) => item.id === event.reservationId);
    if (!row || row.status === 'cancelled') return { state, effects };
    if (event.type === 'check-in') {
      if (row.status !== 'confirmed') return { state, effects };
      if (event.atMs >= checkInDeadline(row)) noShow(row);
      else if (row.predecessorId !== null
        ? event.atMs >= row.confirmedAtMs
        : canCheckInGeneralReservation(row.originalStartMs, event.atMs)) row.status = 'checked-in';
    } else if (event.type === 'operator-cancel') {
      row.status = 'cancelled';
      row.cancellationReason = 'operator';
      row.refundAmount = 3000;
      effects.push({ type: 'refund', reservationId: row.id, amount: 3000 });
      for (const waiter of state.waiters.filter((item) => sameSlot(item, row))) {
        if (!state.cancelledWaiterIds.includes(waiter.id)) state.cancelledWaiterIds.push(waiter.id);
        for (const request of state.paymentRequests) {
          if (request.waiterId === waiter.id) request.active = false;
        }
      }
    } else {
      const cancelled = reduceUserCancellation({ reservationId: row.id,
        originalStartMs: row.originalStartMs, confirmedAtMs: row.confirmedAtMs, depositAmount: 3000,
        status: 'confirmed', cancellationReason: null, refundAmount: 0, refundedAmount: 0 },
      { type: 'cancel', atMs: event.atMs });
      row.status = 'cancelled';
      row.cancellationReason = 'user';
      row.refundAmount = cancelled.state.refundAmount;
      if (row.refundAmount > 0) effects.push({ type: 'refund', reservationId: row.id, amount: row.refundAmount });
      requestNext(row);
    }
  }
  return { state, effects };
}
