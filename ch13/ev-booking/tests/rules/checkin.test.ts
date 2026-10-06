import { describe, expect, it } from 'vitest';
import * as rules from '../../src/rules/index.js';

// US-08 / AC-08-1·AC-08-2의 시각 판정 부분만 검증한다.
// 일반 미체크인 확정 예약과 유효한 epoch milliseconds를 입력한다.
// 노쇼 상태 저장·환불·소유자 확인·승계 예약은 이번 계약의 대상 밖이다.
type CheckinRule = (startMs: number, nowMs: number) => boolean;

function canCheckIn(start: string, now: string): boolean {
  const exported = rules as unknown as Record<string, unknown>;
  expect(
    exported.canCheckInGeneralReservation,
    '一般予約のチェックイン時刻判定が未実装・未公開です',
  ).toBeTypeOf('function');
  return (exported.canCheckInGeneralReservation as CheckinRule)(
    Date.parse(start), Date.parse(now),
  );
}

const START = '2026-10-06T14:00:00+09:00';

// 捕捉する不具合: -10分の誤差・下限の排他化、+15分の誤差・上限の包含、
// 分単位丸め、現在時刻の暗黙取得、日付を無視した比較。
// 期待値はACの[13:50:00, 14:15:00)から独立して記述する。
describe('US-08 — 一般予約のチェックイン可能時刻', () => {
  it.each([
    ['AC-08-1', '13:49:59', false],
    ['AC-08-1', '13:49:59.999', false],
    ['AC-08-1', '13:50:00', true],
    ['AC-08-1', '13:50:00.001', true],
    ['AC-08-2', '14:00:00', true],
    ['AC-08-2', '14:14:59', true],
    ['AC-08-2', '14:14:59.999', true],
    ['AC-08-2', '14:15:00', false],
    ['AC-08-2', '14:15:00.001', false],
    ['AC-08-2', '15:00:00', false],
  ] as const)('%s / 서울 %s의 체크인 허용 여부는 %s', (_ac, time, expected) => {
    // GIVEN: 서울 14:00 시작인 일반 미체크인 확정 예약.
    // WHEN: 호출자가 전달한 서울 시연용 시각으로 가능 여부를 판정한다.
    const actual = canCheckIn(START, `2026-10-06T${time}+09:00`);
    // THEN: 하한 포함·상한 제외이며 밀리초도 버리지 않는다.
    expect(actual).toBe(expected);
  });

  it('AC-08-1 / 자정 시작 예약은 전날 23:50부터 허용한다', () => {
    expect(canCheckIn('2026-10-07T00:00:00+09:00', '2026-10-06T23:50:00+09:00')).toBe(true);
  });

  it('AC-08-2 / 23:50 시작 예약은 다음 날 00:05에 거절한다', () => {
    expect(canCheckIn('2026-10-06T23:50:00+09:00', '2026-10-07T00:05:00+09:00')).toBe(false);
  });
});
