import { describe, expect, it } from 'vitest';
import * as rules from '../../src/rules/index.js';
import { mcpTimeAllowed } from '../../src/rules/mcp-service.js';
import type { TimeRange } from '../../src/rules/index.js';

// T-59: 사용자 명시 확인 전 실행/수집 금지. 제품 함수 mock·대체 구현 없음.
type Resolve = (input: { nowMs: number; date: string; startTime: string; durationMinutes: number }) => {
  range: TimeRange; withinBookingWindow: boolean;
} | null;
function resolve(input: Parameters<Resolve>[0]) {
  const exported = (rules as unknown as Record<string, unknown>).resolveMcpBookingDateTime;
  expect(exported, 'AC-18-13: src/rules/index.ts 공개 날짜·시각 정규화 함수').toBeTypeOf('function');
  return (exported as Resolve)(input);
}
const ms = (iso: string) => Date.parse(iso);
const NOW = ms('2026-10-12T10:00:00+09:00');

describe('T-59 / US-04·18 / 순수 서울 날짜·시각 정규화', () => {
  it.each([
    ['2026-10-12T10:00:00+09:00', '2026-10-13', '15:00', 30, '2026-10-13T15:30:00+09:00'],
    ['2026-10-12T10:00:00+09:00', '2026-10-13', '19:00', 60, '2026-10-13T20:00:00+09:00'],
    ['2026-10-12T00:00:00+09:00', '2026-10-12', '00:00', 30, '2026-10-12T00:30:00+09:00'],
    ['2028-02-28T10:00:00+09:00', '2028-02-29', '23:30', 90, '2028-03-01T01:00:00+09:00'],
    ['2026-10-30T10:00:00+09:00', '2026-10-31', '23:30', 90, '2026-11-01T01:00:00+09:00'],
    ['2026-12-30T10:00:00+09:00', '2026-12-31', '23:30', 90, '2027-01-01T01:00:00+09:00'],
  ] as const)('AC-18-13 / GIVEN now %s WHEN %s %s·%s분 THEN 종료 %s·서울 날짜 보존', (now, date, startTime, durationMinutes, end) => {
    const input = { nowMs: ms(now), date, startTime, durationMinutes };
    expect(resolve(input)).toEqual({ range: { startMs: ms(`${date}T${startTime}:00+09:00`), endMs: ms(end) }, withinBookingWindow: true });
    expect(input).toEqual({ nowMs: ms(now), date, startTime, durationMinutes });
  });

  it.each([
    [NOW, '2026-10-12', '10:00', 30, true],
    [NOW, '2026-10-19', '10:00', 90, true],
    [NOW, '2026-10-12', '09:30', 30, false],
    [NOW, '2026-10-19', '10:30', 30, false],
    [NOW + 1, '2026-10-12', '10:00', 30, false],
  ] as const)('AC-04-1·AC-18-15 / GIVEN now %s WHEN %s %s·%s분 THEN 기간 허용 %s', (nowMs, date, startTime, durationMinutes, allowed) => {
    const result = resolve({ nowMs, date, startTime, durationMinutes });
    expect(result).not.toBeNull();
    expect(result?.withinBookingWindow).toBe(allowed);
    expect(result?.range).toEqual({ startMs: ms(`${date}T${startTime}:00+09:00`), endMs: ms(`${date}T${startTime}:00+09:00`) + durationMinutes * 60_000 });
    if (result) expect(mcpTimeAllowed(result.range, nowMs)).toBe(allowed);
  });

  it.each([
    ['15:00', 30, true], ['15:30', 60, true], ['19:00', 90, true],
    ['15:15', 30, false], ['15:45', 30, false],
    ['15:00', 15, false], ['15:00', 45, false], ['15:00', 120, false],
  ] as const)('AC-04-2·AC-18-15 / GIVEN 유효 날짜 WHEN %s·%s분 THEN 기존 최종 시간 판정 %s', (startTime, durationMinutes, allowed) => {
    const result = resolve({ nowMs: NOW, date: '2026-10-13', startTime, durationMinutes });
    expect(result).not.toBeNull();
    // 정규화의 withinBookingWindow는 시작 기간만 나타낸다.
    expect(result?.withinBookingWindow).toBe(true);
    if (result) expect(mcpTimeAllowed(result.range, NOW)).toBe(allowed);
  });

  it.each([
    ['2026-02-29', '19:00'], ['2026-02-30', '19:00'],
    ['2026-00-13', '19:00'], ['2026-13-13', '19:00'],
    ['2026-10-00', '19:00'], ['2026-10-32', '19:00'],
    ['2026-1-13', '19:00'], ['2026/10/13', '19:00'],
    ['', '19:00'], [' 2026-10-13', '19:00'], ['2026-10-13 ', '19:00'],
    ['2026-10-13', '24:00'], ['2026-10-13', '25:00'], ['2026-10-13', '19:60'],
    ['2026-10-13', '7:00'], ['2026-10-13', '19:00:00'], ['2026-10-13', '19:00+09:00'],
    ['2026-10-13', ''], ['2026-10-13', ' 19:00'], ['2026-10-13', '19:00 '],
  ] as const)('AC-18-14 / GIVEN 잘못된 %s %s WHEN 정규화 THEN null·자동 보정 없음', (date, startTime) => {
    expect(resolve({ nowMs: NOW, date, startTime, durationMinutes: 30 })).toBeNull();
  });
});
