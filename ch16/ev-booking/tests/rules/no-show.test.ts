import { describe, expect, it } from 'vitest';
import * as rules from '../../src/rules/index.js';

// T-26·T-36: 순수 규칙의 공개 계약. 저장·권한·시계 복구·실제 환불은 범위 밖.
// 경계 포함 오류, 체크인 보호 누락, 중복 전이, 승계 기한 기준 오류를 잡는다.
interface NoShowState {
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
interface NoShowResult {
  readonly state: NoShowState;
  readonly effects: readonly { readonly type: 'request-succession'; readonly reservationId: string }[];
}
type NoShowReducer = (state: NoShowState, event: { readonly type: 'tick'; readonly atMs: number }) => NoShowResult;

const at = (time: string): number => Date.parse(`2026-10-06T${time}+09:00`);
function paid(overrides: Partial<NoShowState> = {}): NoShowState {
  return {
    reservationId: 'reservation-A', originalStartMs: at('14:00:00'),
    originalEndMs: at('15:30:00'), successionConfirmedAtMs: null,
    status: 'confirmed', cancellationReason: null, noShowCount: 0,
    refundAmount: 0, activeReservationCount: 1, ...overrides,
  };
}
function tick(state: NoShowState, time: string): NoShowResult {
  const exported = rules as unknown as Record<string, unknown>;
  expect(exported.reduceNoShow, 'src/rules/index.ts의 reduceNoShow가 미구현·미공개입니다').toBeTypeOf('function');
  return (exported.reduceNoShow as NoShowReducer)(state, { type: 'tick', atMs: at(time) });
}
function expectNoShow(result: NoShowResult): void {
  expect(result.state).toMatchObject({
    status: 'cancelled', cancellationReason: 'no-show', noShowCount: 1,
    refundAmount: 0, activeReservationCount: 0,
  });
  expect(result.effects).toEqual([{ type: 'request-succession', reservationId: 'reservation-A' }]);
}

describe('US-16 / T-26 — 일반 예약 노쇼 자동 취소 (서울 시연용 시각)', () => {
  it.each(['14:14:59', '14:14:59.999'])('AC-16-1 / %s — 15분 직전에는 확정 상태 유지', (time) => {
    const state = paid();
    const result = tick(state, time);
    expect(result.state).toEqual(state);
    expect(result.effects).toEqual([]);
  });
  it.each(['14:15:00.000', '14:15:00.001'])('AC-16-1·AC-08-2·AC-03-3 / %s — 노쇼 취소·환불 0원·제한 해제', (time) => {
    const result = tick(paid(), time);
    expectNoShow(result);
    expect(result.state.originalStartMs).toBe(at('14:00:00'));
    expect(result.state.originalEndMs).toBe(at('15:30:00'));
  });
  it.each(['14:15:00', '14:15:00.001'])('AC-16-2 / 14:14:59 체크인 후 %s — 노쇼로 취소하지 않음', (time) => {
    const state = paid({ status: 'checked-in' });
    const result = tick(state, time);
    expect(result.state).toEqual(state);
    expect(result.effects).toEqual([]);
  });
  it('AC-16-3 / 같은 기한 반복 — 노쇼·승계 연결 요청 각 1건', () => {
    const first = tick(paid(), '14:15:00');
    const second = tick(first.state, '14:15:00');
    const third = tick(second.state, '14:15:00.001');
    expectNoShow(first);
    expect(second.state).toEqual(first.state);
    expect(third.state).toEqual(first.state);
    expect([...second.effects, ...third.effects]).toEqual([]);
  });
  it.each([
    { status: 'cancelled' as const, cancellationReason: 'user' as const },
    { status: 'cancelled' as const, cancellationReason: 'operator' as const },
    { status: 'ended' as const, cancellationReason: null },
  ])('PRD 4.2.1 / 종료된 상태 %j — 노쇼로 바꾸지 않음', (overrides) => {
    const state = paid({ ...overrides, activeReservationCount: 0 });
    const result = tick(state, '14:15:00');
    expect(result.state).toEqual(state);
    expect(result.effects).toEqual([]);
  });
});

describe('US-11 / T-36 — 승계자 노쇼는 승계 확정 +15분', () => {
  it.each(['14:20:00', '14:34:59.999'])('AC-08-4 / %s — 원래 시작 +15분이 지나도 승계자 기한 전에는 유지', (time) => {
    const state = paid({ successionConfirmedAtMs: at('14:20:00') });
    const result = tick(state, time);
    expect(result.state).toEqual(state);
    expect(result.effects).toEqual([]);
  });
  it.each(['14:35:00.000', '14:35:00.001'])('AC-08-4·AC-11-6 / %s — 승계 확정 +15분에 노쇼·다음 승계 연결', (time) => {
    const result = tick(paid({ successionConfirmedAtMs: at('14:20:00') }), time);
    expectNoShow(result);
    expect(result.state.originalEndMs).toBe(at('15:30:00'));
  });
});
