import { parseDate, canRecord } from './dates.mjs';

export const STORAGE_KEY = 'habit-tracker.v1';

export function readHabits(raw) {
  if (raw === null) return [];
  const value = JSON.parse(raw);
  if (value?.version !== 1 || !Array.isArray(value.habits)) throw new Error('저장 형식을 확인할 수 없습니다.');
  const ids = new Set();
  for (const habit of value.habits) {
    if (!habit || typeof habit.id !== 'string' || !habit.id || ids.has(habit.id) ||
        typeof habit.name !== 'string' || !habit.name.trim() || habit.name.length > 60 || !Array.isArray(habit.records)) {
      throw new Error('저장된 습관을 읽을 수 없습니다.');
    }
    ids.add(habit.id);
    parseDate(habit.createdAt);
    for (const key of habit.records) {
      parseDate(key);
      if (key < habit.createdAt) throw new Error('등록 전 기록이 있습니다.');
    }
    habit.records = [...new Set(habit.records)].sort();
  }
  return value.habits;
}

export function toggleRecord(habit, date, today) {
  if (!canRecord(date, habit.createdAt, today)) throw new Error('등록일부터 오늘까지 기록할 수 있습니다.');
  const records = new Set(habit.records);
  if (records.has(date)) records.delete(date);
  else records.add(date);
  return { ...habit, records: [...records].sort() };
}
