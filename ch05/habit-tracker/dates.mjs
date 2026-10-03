const DAY = 86_400_000;

// 날짜 문자열을 달력상의 하루로 다룬다. UTC는 날짜 연산에만 사용한다.
// '오늘'은 반드시 기기의 현지 날짜에서 가져오므로 시간대·서머타임에 영향받지 않는다.
export function localDateKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function parseDate(key) {
  if (typeof key !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(key)) throw new Error('올바른 날짜가 아닙니다.');
  const date = new Date(`${key}T00:00:00.000Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== key) throw new Error('올바른 날짜가 아닙니다.');
  return date;
}

export function addDays(key, count) {
  return new Date(parseDate(key).getTime() + count * DAY).toISOString().slice(0, 10);
}

export function canRecord(key, createdAt, today) {
  try { parseDate(key); return key >= createdAt && key <= today; } catch { return false; }
}

export function streak(records, createdAt, today) {
  const completed = new Set(records);
  let cursor = completed.has(today) ? today : addDays(today, -1);
  let count = 0;
  while (cursor >= createdAt && completed.has(cursor)) {
    count++;
    cursor = addDays(cursor, -1);
  }
  return count;
}

// 월요일 시작, 이번 주를 포함한 12개 달력 주. 이번 주의 미래 칸은 비활성화한다.
export function heatmapWeeks(records, createdAt, today) {
  const mondayOffset = (parseDate(today).getUTCDay() + 6) % 7;
  const start = addDays(today, -mondayOffset - 77);
  const completed = new Set(records);
  return Array.from({ length: 12 }, (_, week) => Array.from({ length: 7 }, (_, day) => {
    const date = addDays(start, week * 7 + day);
    const status = date > today ? 'future' : date < createdAt ? 'before' : completed.has(date) ? 'done' : 'missed';
    return { date, status };
  }));
}

export function displayDate(key) {
  const date = parseDate(key);
  return `${date.getUTCMonth() + 1}월 ${date.getUTCDate()}일`;
}
