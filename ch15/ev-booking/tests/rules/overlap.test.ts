import { describe, expect, it } from 'vitest';
import { hasReservationOverlap, intervalsOverlap } from '../../src/rules/index.js';
import type { ChargerIdentity, Occupancy, TimeRange } from '../../src/rules/types.js';

// T009 이후 제공될 공개 진입점을 사용한다. 사용자 확인 전에는 실행하지 않는다.
const CHARGER_A: ChargerIdentity = { statId: 'STATION-A', chgerId: '01' };
const KINDS = ['confirmed', 'valid-hold'] as const;

function range(start: string, end: string): TimeRange {
  return {
    startMs: Date.parse(`2026-10-06T${start}:00+09:00`),
    endMs: Date.parse(`2026-10-06T${end}:00+09:00`),
  };
}

const EXISTING_RANGE = range('10:00', '11:00');

function occupancy(
  kind: Occupancy['kind'],
  charger: ChargerIdentity = CHARGER_A,
): Occupancy {
  return { kind, charger, range: EXISTING_RANGE };
}

// 기대값은 AC와 시나리오에서 독립 작성한다. 구현의 겹침 판정식을 사용하지 않는다.
const INTERVAL_CASES = [
  { scenario: 'S-01', label: '뒤쪽 부분 겹침', start: '10:30', end: '11:30', expected: true },
  { scenario: 'S-03', label: '기존 종료 = 새 시작', start: '11:00', end: '11:30', expected: false },
  { scenario: 'S-05', label: '새 종료 = 기존 시작', start: '09:30', end: '10:00', expected: false },
  { scenario: 'S-06', label: '동일 구간', start: '10:00', end: '11:00', expected: true },
  { scenario: 'S-06', label: '기존 구간 안쪽', start: '10:00', end: '10:30', expected: true },
  { scenario: 'S-06', label: '기존 구간 전체 포함', start: '09:30', end: '11:00', expected: true },
  { scenario: 'S-01', label: '앞쪽 부분 겹침 대칭 사례', start: '09:30', end: '10:30', expected: true },
] as const;

const OCCUPANCY_CASES = [
  { scenario: 'S-01/S-02', label: '부분 겹침', start: '10:30', end: '11:30', expected: true },
  { scenario: 'S-03/S-04', label: '기존 종료 = 새 시작', start: '11:00', end: '11:30', expected: false },
  { scenario: 'S-05', label: '새 종료 = 기존 시작', start: '09:30', end: '10:00', expected: false },
  { scenario: 'S-06', label: '동일 구간', start: '10:00', end: '11:00', expected: true },
  { scenario: 'S-06', label: '기존 구간 안쪽', start: '10:00', end: '10:30', expected: true },
  { scenario: 'S-06', label: '기존 구간 전체 포함', start: '09:30', end: '11:00', expected: true },
] as const;

function frozenOccupancy(kind: Occupancy['kind']): Occupancy {
  return Object.freeze({
    kind,
    charger: Object.freeze({ ...CHARGER_A }),
    range: Object.freeze({ ...EXISTING_RANGE }),
  });
}

describe('US1 / AC-04-3 — 반열린 구간 비교', () => {
  for (const row of INTERVAL_CASES) {
    it(`AC-04-3 / ${row.scenario} / ${row.label}`, () => {
      // GIVEN: 기존 구간 10:00~11:00, 서울 오프셋을 명시한 정상 구간.
      const requested = range(row.start, row.end);
      // WHEN: 정방향과 역방향으로 두 구간을 비교한다.
      const forward = intervalsOverlap(EXISTING_RANGE, requested);
      const reverse = intervalsOverlap(requested, EXISTING_RANGE);
      // THEN: 명세의 기대값과 같고 비교 순서에 영향받지 않는다.
      expect(forward).toBe(row.expected);
      expect(reverse).toBe(row.expected);
    });
  }
});

describe.each(KINDS)('US1 / AC-04-3 — %s 확보 구간', (kind) => {
  for (const row of OCCUPANCY_CASES) {
    it(`AC-04-3 / ${row.scenario} / ${row.label}`, () => {
      // GIVEN: A의 확정 예약 또는 유효 임시 점유가 10:00~11:00을 확보했다.
      const occupancies = [occupancy(kind)];
      // WHEN: 같은 A의 요청 시간을 판정한다.
      const actual = hasReservationOverlap(CHARGER_A, range(row.start, row.end), occupancies);
      // THEN: 겹치면 true, 동일 경계만 맞닿으면 false이다.
      expect(actual).toBe(row.expected);
    });
  }

  it('AC-04-3 / S-01/S-02 / 목록 뒤쪽의 같은 충전기 겹침도 찾는다', () => {
    // GIVEN: 첫 기록은 다른 충전기이고 두 번째 기록은 A의 겹치는 확보 구간이다.
    const occupancies = [
      occupancy(kind, { statId: 'STATION-B', chgerId: '01' }),
      occupancy(kind),
    ];
    // WHEN: A의 부분 겹침을 요청한다.
    const actual = hasReservationOverlap(CHARGER_A, range('10:30', '11:30'), occupancies);
    // THEN: 배열의 첫 기록만 검사해 겹침을 놓치지 않는다.
    expect(actual).toBe(true);
  });

  const OTHER_CHARGERS: readonly ChargerIdentity[] = [
    { statId: 'STATION-A', chgerId: '02' },
    { statId: 'STATION-B', chgerId: '01' },
    { statId: 'STATION-B', chgerId: '02' },
  ];
  for (const other of OTHER_CHARGERS) {
    it(`AC-01-1·AC-04-3 / S-07 / ${other.statId}+${other.chgerId}는 다른 충전기`, () => {
      // GIVEN: A에는 확보 구간이 있고 B는 두 식별자 중 하나 이상이 다르다.
      const occupancies = [occupancy(kind)];
      // WHEN: 다른 충전기의 동일 이용 구간을 요청한다.
      const actual = hasReservationOverlap(other, EXISTING_RANGE, occupancies);
      // THEN: A의 기록으로 B를 겹침 거절하지 않는다. 목록 화면은 이번 검증 밖이다.
      expect(actual).toBe(false);
    });
  }

  it('AC-04-3 / S-01~S-07 재사용 / 동결된 중첩 입력 불변·반복 결과 동일', () => {
    // GIVEN: 정상 충전기·요청 구간·유효 목록과 내부 객체를 모두 동결했다.
    const charger = Object.freeze({ ...CHARGER_A });
    const requested = Object.freeze(range('10:30', '11:30'));
    const occupancies = Object.freeze([frozenOccupancy(kind)]);
    const before = structuredClone({ charger, requested, occupancies });
    // WHEN: 같은 스냅샷을 두 번 판정한다.
    const first = hasReservationOverlap(charger, requested, occupancies);
    const second = hasReservationOverlap(charger, requested, occupancies);
    // THEN: 알려진 겹침 결과를 유지하고 입력의 중첩 값도 변하지 않는다.
    expect(first).toBe(true);
    expect(second).toBe(first);
    expect({ charger, requested, occupancies }).toEqual(before);
  });
});

it('AC-04-3 / S-01~S-07 입력 전제 대조 / 빈 유효 목록은 겹침 없음', () => {
  // GIVEN: 현재 유효한 확보 구간이 없다.
  const occupancies: readonly Occupancy[] = Object.freeze([]);
  // WHEN: 정상 이용 구간을 요청한다.
  // THEN: 거절할 시간 겹침 근거가 없다.
  expect(hasReservationOverlap(CHARGER_A, EXISTING_RANGE, occupancies)).toBe(false);
});

it('AC-04-3 / S-03/S-05 재사용 / 구간 비교도 동결 입력 불변·반복 결과 동일', () => {
  // GIVEN: 끝과 시작만 맞닿는 동결 구간이다.
  const previous = Object.freeze({ ...EXISTING_RANGE });
  const next = Object.freeze(range('11:00', '11:30'));
  const before = structuredClone({ previous, next });
  // WHEN: 양방향·반복 비교한다.
  const first = intervalsOverlap(previous, next);
  const second = intervalsOverlap(previous, next);
  const reverse = intervalsOverlap(next, previous);
  // THEN: 모두 false이고 기존 시간값은 그대로이다.
  expect(first).toBe(false);
  expect(second).toBe(first);
  expect(reverse).toBe(first);
  expect({ previous, next }).toEqual(before);
});
