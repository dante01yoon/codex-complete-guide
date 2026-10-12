import { access, readdir, readFile } from 'node:fs/promises';
import { afterEach, describe, expect, it } from 'vitest';
import { createMcpBookingService } from '../../src/mcp/booking-service.js';
import { fixture, NOW, rawCharger, searchArgs, START } from './fixtures.js';
import type { Fixture } from './fixtures.js';

// T-59: 새 파일 사용자 확인 전 실행/수집 금지. 기존 fixture는 읽기 재사용만.
const fixtures: Fixture[] = [];
async function setup(...args: Parameters<typeof fixture>) {
  const f = await fixture(...args); fixtures.push(f); return f;
}
afterEach(async () => { await Promise.all(fixtures.splice(0).map((f) => f.clean())); });
const ms = (iso: string) => Date.parse(iso);
const base = { location: '강남역', connector: 'DC콤보', durationMinutes: 30 };
const explicit = { ...base, date: '2026-10-13', startTime: '19:00' };

describe('T-59 / AC별 날짜 입력 service·검색→점유 연결', () => {
  it.each([
    ['15:00', 30], ['19:00', 30], ['19:30', 60], ['23:30', 90],
  ] as const)('AC-18-13·15 / GIVEN 서울12일10시 WHEN 13일%s·%s분 검색 THEN 명시 구간과 적격 후보', async (startTime, durationMinutes) => {
    const f = await setup([rawCharger(), rawCharger({ statId: 'LIMIT', limitYn: 'Y' }), rawCharger({ statId: 'OTHER', chgerType: '01' })]);
    const result = await createMcpBookingService(f.options).searchChargers({ ...explicit, startTime, durationMinutes });
    const startMs = ms(`2026-10-13T${startTime}:00+09:00`);
    expect(result.range).toEqual({ startMs, endMs: startMs + durationMinutes * 60_000 });
    expect(result.candidates.map((c) => c.charger)).toEqual([{ statId: 'A', chgerId: '01' }]);
    expect(await access(f.statePath).then(() => true, () => false)).toBe(false);
  });

  it.each([
    [NOW, '2026-10-12', '10:00', 30, true], [NOW, '2026-10-19', '10:00', 90, true],
    [NOW, '2026-10-12', '09:30', 30, false], [NOW, '2026-10-19', '10:30', 30, false],
    [NOW + 1, '2026-10-12', '10:00', 30, false],
    [NOW, '2026-10-13', '15:15', 30, false], [NOW, '2026-10-13', '15:45', 30, false],
  ] as const)('AC-04-1·2·AC-18-15 / GIVEN now %s WHEN %s %s·%s분 THEN 허용 %s·위반 INVALID_TIME', async (now, date, startTime, durationMinutes, allowed) => {
    const f = await setup(); f.setNow(now);
    const search = createMcpBookingService(f.options).searchChargers({ ...base, date, startTime, durationMinutes });
    if (allowed) {
      const startMs = ms(`${date}T${startTime}:00+09:00`);
      expect((await search).range).toEqual({ startMs, endMs: startMs + durationMinutes * 60_000 });
    } else await expect(search).rejects.toMatchObject({ code: 'INVALID_TIME' });
  });

  it.each([
    ['둘 다 없음', {}], ['날짜만', { date: '2026-10-13' }], ['시각만', { startTime: '19:00' }],
    ['세 필드 혼용', { date: '2026-10-13', startTime: '19:00', timeText: '7시' }],
    ['legacy·날짜 혼용', { timeText: '7시', date: '2026-10-13' }],
    ['legacy·시각 혼용', { timeText: '7시', startTime: '19:00' }], ['다른 legacy', { timeText: '8시' }],
    ['평년 윤일', { date: '2026-02-29', startTime: '19:00' }], ['보정 가능 날짜', { date: '2026-02-30', startTime: '19:00' }],
    ['날짜 타입', { date: 20261013, startTime: '19:00' }],
    ['24시 이월', { date: '2026-10-13', startTime: '24:00' }],
    ['시각 초', { date: '2026-10-13', startTime: '19:00:00' }],
    ['시각 null', { date: '2026-10-13', startTime: null }],
  ])('AC-18-14 / GIVEN %s WHEN 검색 THEN INVALID_ARGUMENTS·저장 부작용 없음', async (_label, timeInput) => {
    const f = await setup(); const before = await readdir(f.projectRoot);
    await expect(createMcpBookingService(f.options).searchChargers({ ...base, ...timeInput })).rejects.toMatchObject({ code: 'INVALID_ARGUMENTS' });
    expect(await readdir(f.projectRoot)).toEqual(before);
  });

  it.each([15, 45, 120])('AC-04-2·AC-18-15 / GIVEN 유효 명시 날짜 WHEN 길이 %s분 THEN INVALID_ARGUMENTS', async (durationMinutes) => {
    const f = await setup();
    await expect(createMcpBookingService(f.options).searchChargers({ ...explicit, durationMinutes })).rejects.toMatchObject({ code: 'INVALID_ARGUMENTS' });
  });

  it('AC-18-3·14 / GIVEN 기존7시 단독 WHEN 검색·오늘19시1ms후 재검색 THEN 오늘19시·과거 INVALID_TIME', async () => {
    const f = await setup(); const service = createMcpBookingService(f.options);
    expect((await service.searchChargers(searchArgs)).range).toEqual({ startMs: START, endMs: START + 1_800_000 });
    f.setNow(START + 1);
    await expect(service.searchChargers(searchArgs)).rejects.toMatchObject({ code: 'INVALID_TIME' });
  });

  it('AC-18-13·15·10 / GIVEN 명시 검색 구간 WHEN hold·5분후 동일 재요청 THEN 구간·저장·원래10분 유지', async () => {
    const f = await setup(); const service = createMcpBookingService(f.options);
    const searched = await service.searchChargers(explicit);
    const args = { statId: 'A', chgerId: '01', connector: 'DC콤보', startMs: searched.range.startMs, durationMinutes: 30, requestId: 'datetime-hold' };
    const hold = await service.holdCharger(args);
    expect(hold).toMatchObject({ range: searched.range, connector: 'DC콤보', createdAtMs: NOW, expiresAtMs: NOW + 600_000 });
    f.setNow(NOW + 300_000);
    expect(await service.holdCharger(args)).toEqual(hold);
    expect(JSON.parse(await readFile(f.statePath, 'utf8'))).toMatchObject({ holds: [hold] });
  });

  it('AC-04-3·AC-18-1·10·15 / GIVEN 13일19시60분 점유 WHEN 겹침·연속·다른 날짜 검색/hold THEN 겹침만 거절', async () => {
    const f = await setup(); const service = createMcpBookingService(f.options);
    const searched = await service.searchChargers({ ...explicit, durationMinutes: 60 });
    const args = { statId: 'A', chgerId: '01', connector: 'DC콤보', startMs: searched.range.startMs, durationMinutes: 60, requestId: 'datetime-first' };
    await service.holdCharger(args);
    expect((await service.searchChargers({ ...explicit, startTime: '19:30' })).candidates).toEqual([]);
    await expect(service.holdCharger({ ...args, startMs: args.startMs + 1_800_000, durationMinutes: 30, requestId: 'datetime-conflict' })).rejects.toMatchObject({ code: 'HOLD_CONFLICT' });
    for (const [date, startTime, requestId] of [['2026-10-13', '20:00', 'datetime-adjacent'], ['2026-10-14', '19:00', 'datetime-next-day']] as const) {
      const next = await service.searchChargers({ ...explicit, date, startTime });
      expect(next.candidates).toHaveLength(1);
      expect((await service.holdCharger({ ...args, startMs: next.range.startMs, durationMinutes: 30, requestId })).range).toEqual(next.range);
    }
  });
});
