import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { localDateKey, parseDate, addDays, canRecord, streak, heatmapWeeks } from './dates.mjs';
import { readHabits, toggleRecord } from './model.mjs';

test('현지 날짜를 연-월-일로 반환', () => {
  assert.equal(localDateKey(new Date(2026, 0, 2, 23, 59)), '2026-01-02');
});
test('잘못된 날짜 거부', () => {
  for (const key of ['2026-02-29', '2024-02-30', '2026-13-01', '26-1-1', '', null]) assert.throws(() => parseDate(key));
});
test('월말·연말·윤년 경계', () => {
  assert.equal(addDays('2026-01-31', 1), '2026-02-01');
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(addDays('2024-02-28', 1), '2024-02-29');
  assert.equal(addDays('2024-03-01', -1), '2024-02-29');
  assert.equal(addDays('2026-03-01', -1), '2026-02-28');
});
test('기록 없음·오늘과 어제 미완료는 0일', () => {
  assert.equal(streak([], '2026-09-01', '2026-10-03'), 0);
  assert.equal(streak(['2026-10-01'], '2026-09-01', '2026-10-03'), 0);
});
test('오늘 완료하면 오늘 포함, 미완료라면 어제까지 유지', () => {
  const records = ['2026-10-01', '2026-10-02'];
  assert.equal(streak(records, '2026-10-01', '2026-10-03'), 2);
  assert.equal(streak([...records, '2026-10-03'], '2026-10-01', '2026-10-03'), 3);
});
test('중간 누락·등록일·중복·미래 기록 처리', () => {
  assert.equal(streak(['2026-10-01', '2026-10-03'], '2026-10-01', '2026-10-03'), 1);
  assert.equal(streak(['2026-10-02', '2026-10-03', '2026-10-03', '2026-10-04'], '2026-10-03', '2026-10-03'), 1);
});
test('체크·취소·과거 기록 수정 후 연속 일수 재계산', () => {
  let habit = { id: 'a', name: '독서', createdAt: '2026-10-01', records: ['2026-10-01', '2026-10-03'] };
  habit = toggleRecord(habit, '2026-10-02', '2026-10-03');
  assert.equal(streak(habit.records, habit.createdAt, '2026-10-03'), 3);
  assert.equal(heatmapWeeks(habit.records, habit.createdAt, '2026-10-03').flat().find(c => c.date === '2026-10-02').status, 'done');
  habit = toggleRecord(habit, '2026-10-02', '2026-10-03');
  assert.equal(streak(habit.records, habit.createdAt, '2026-10-03'), 1);
});
test('연속 실천 일수의 연말·윤년 경계', () => {
  assert.equal(streak(['2026-12-31', '2027-01-01'], '2026-12-31', '2027-01-01'), 2);
  assert.equal(streak(['2024-02-28', '2024-02-29', '2024-03-01'], '2024-02-28', '2024-03-01'), 3);
});
test('등록 전·미래·잘못된 날짜 수정 거부', () => {
  const habit = { createdAt: '2026-10-02', records: [] };
  for (const key of ['2026-10-01', '2026-10-04', '2026-02-30']) {
    assert.equal(canRecord(key, habit.createdAt, '2026-10-03'), false);
    assert.throws(() => toggleRecord(habit, key, '2026-10-03'));
  }
  assert.equal(canRecord('2026-10-02', habit.createdAt, '2026-10-03'), true);
});
test('최근 12주 히트맵: 월요일 시작, 84칸, 모든 상태', () => {
  const weeks = heatmapWeeks(['2026-10-02'], '2026-10-01', '2026-10-03');
  assert.equal(weeks.length, 12);
  assert.equal(weeks.flat().length, 84);
  assert.equal(parseDate(weeks[0][0].date).getUTCDay(), 1);
  assert.equal(weeks.at(-1).at(-1).date, '2026-10-04');
  const status = Object.fromEntries(weeks.flat().map(c => [c.date, c.status]));
  assert.equal(status['2026-09-30'], 'before');
  assert.equal(status['2026-10-01'], 'missed');
  assert.equal(status['2026-10-02'], 'done');
  assert.equal(status['2026-10-03'], 'missed');
  assert.equal(status['2026-10-04'], 'future');
});
test('날짜 변경 시 연속 일수와 히트맵 갱신', () => {
  const records = ['2026-12-31'];
  assert.equal(streak(records, '2026-12-31', '2027-01-01'), 1);
  assert.equal(streak(records, '2026-12-31', '2027-01-02'), 0);
  assert.ok(heatmapWeeks(records, '2026-12-31', '2027-01-02').flat().some(c => c.date === '2027-01-02' && c.status === 'missed'));
});
test('시간대·서머타임에도 달력 날짜 연산 유지', () => {
  for (const tz of ['America/New_York', 'Asia/Seoul', 'Pacific/Honolulu']) {
    const result = execFileSync(process.execPath, ['--input-type=module', '-e', `
      import {localDateKey, addDays, streak} from './dates.mjs';
      console.log(JSON.stringify([
        localDateKey(new Date(2026, 2, 8, 23, 30)),
        addDays('2026-03-08', 1), addDays('2026-11-01', 1),
        streak(['2026-03-07', '2026-03-08', '2026-03-09'], '2026-03-07', '2026-03-09')
      ]));`], { cwd: new URL('.', import.meta.url), env: { ...process.env, TZ: tz }, encoding: 'utf8' });
    assert.deepEqual(JSON.parse(result), ['2026-03-08', '2026-03-09', '2026-11-02', 3]);
  }
});
test('저장 데이터 복원·중복 정리·손상 감지', () => {
  assert.deepEqual(readHabits(null), []);
  const habit = { id: 'a', name: '독서', createdAt: '2026-10-01', records: ['2026-10-02', '2026-10-02'] };
  assert.deepEqual(readHabits(JSON.stringify({ version: 1, habits: [habit] }))[0].records, ['2026-10-02']);
  for (const raw of ['{', '{}', JSON.stringify({ version: 1, habits: [habit, habit] }), JSON.stringify({ version: 1, habits: [{ ...habit, records: ['2026-09-30'] }] })]) assert.throws(() => readHabits(raw));
});

test('12주 범위의 월요일·일요일·연도 변경과 날짜 유일성', () => {
  for (const today of ['2026-10-05', '2026-10-04', '2027-01-01']) {
    const cells = heatmapWeeks([], '2026-01-01', today).flat();
    assert.equal(new Set(cells.map(c => c.date)).size, 84);
    assert.equal(parseDate(cells[0].date).getUTCDay(), 1);
    assert.equal(parseDate(cells.at(-1).date).getUTCDay(), 0);
    assert.equal(cells.filter(c => c.date === today).length, 1);
    for (let i = 1; i < cells.length; i++) assert.equal(cells[i].date, addDays(cells[i - 1].date, 1));
  }
});

test('12주보다 오래된 기록 수정 및 저장 복원, 다른 습관 기록 보존', () => {
  const original = { id: 'a', name: '독서', createdAt: '2026-01-01', records: [] };
  const other = { id: 'b', name: '산책', createdAt: '2026-01-01', records: ['2026-10-03'] };
  const updated = toggleRecord(original, '2026-01-02', '2026-10-03');
  assert.deepEqual(original.records, []);
  const restored = readHabits(JSON.stringify({ version: 1, habits: [updated, other] }));
  assert.deepEqual(restored[0].records, ['2026-01-02']);
  assert.deepEqual(restored[1].records, ['2026-10-03']);
  assert.equal(heatmapWeeks(restored[0].records, original.createdAt, '2026-10-03').flat().some(c => c.date === '2026-01-02'), false);
});
