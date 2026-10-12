import { describe, expect, it } from 'vitest';
import * as rules from '../../src/rules/index.js';
import type { ChargerIdentity, ChargerTypeCode, ConnectorKind, Occupancy, TimeRange } from '../../src/rules/index.js';

// T-53: 사용자 확인 전 실행하지 않는다. 실제 MCP·토스 호출·구현 스텁 없음.
// AC-18-1은 후보 판정·기한 부분만 검증한다. 도구 등록·권한·원자 저장은 별도.
// C-12 정확히 1000m 포함·거리/ID 정렬은 사용자 추가 확정. C-13 다른 문장,
// C-15 승인 파일 정책의 순수 판정만 검증한다. 파일 I/O·승인 폴더 가드·URL 생성은 별도.
interface Candidate {
  charger: ChargerIdentity;
  chargerType: ChargerTypeCode;
  existingEligibilityPassed: boolean;
  distanceMeters: number;
}
interface McpContract {
  resolveMcpBookingTime(input: { nowMs: number; timeText: '7시'; durationMinutes: number }): {
    range: TimeRange; withinBookingWindow: boolean;
  };
  filterMcpChargerCandidates(input: {
    candidates: readonly Candidate[]; connector: ConnectorKind;
    range: TimeRange; occupancies: readonly Occupancy[];
  }): readonly Candidate[];
  getMcpHoldTiming(input: { createdAtMs: number; nowMs: number }): {
    expiresAtMs: number; isExpired: boolean;
  };
  evaluateMcpPaymentLinkRequest(input: {
    holdId: string; charger: ChargerIdentity; range: TimeRange;
    nowMs: number; holdExpiresAtMs: number; claimedApproval?: unknown;
  }, context: { approvalFileExists: boolean; approvalHoldId: string | null }): {
    linkAllowed: boolean; holdExpired: boolean;
    summary: { holdId: string; charger: ChargerIdentity; range: TimeRange;
      amount: 3000; currency: 'KRW'; holdExpiresAtMs: number };
    approvalCommand: string; effects: readonly unknown[];
  };
  isMcpPaymentLinkUsable(input: {
    nowMs: number; holdExpiresAtMs: number; linkExpiresAtMs: number;
  }): boolean;
}

// 공개 함수 누락은 기능 미제공 assertion으로 드러낸다. 대체 구현·mock 없음.
function publicRule<K extends keyof McpContract>(name: K): McpContract[K] {
  const exported = (rules as unknown as Record<string, unknown>)[name];
  expect(exported, `src/rules/index.ts 공개 함수 ${name}`).toBeTypeOf('function');
  return exported as McpContract[K];
}
const ms = (iso: string): number => Date.parse(iso);
const charger: ChargerIdentity = { statId: 'fixture_station', chgerId: '01' };
const range: TimeRange = {
  startMs: ms('2026-10-12T19:00:00+09:00'),
  endMs: ms('2026-10-12T19:30:00+09:00'),
};
const candidate = (overrides: Partial<Candidate> = {}): Candidate => ({
  charger, chargerType: '04', existingEligibilityPassed: true, distanceMeters: 500, ...overrides,
});
const createdAtMs = ms('2026-10-12T10:00:00+09:00');
const holdExpiresAtMs = ms('2026-10-12T10:10:00+09:00');

describe('US-18 / 서울 시연용 오늘 저녁 예약', () => {
  it.each([
    ['2026-10-12T10:00:00+09:00', true],
    ['2026-10-11T15:30:00Z', true], // 서울은 이미 10월 12일 00:30.
    ['2026-10-12T19:00:00+09:00', true],
    ['2026-10-12T19:00:00.001+09:00', false],
  ] as const)('AC-18-3 / AC-04-1·2 기간·30분 부분 / GIVEN %s WHEN 7시 30분 THEN 오늘19시와 기간판정 %s', (now, allowed) => {
    const result = publicRule('resolveMcpBookingTime')({ nowMs: ms(now), timeText: '7시', durationMinutes: 30 });
    expect(result).toEqual({
      range: { startMs: ms('2026-10-12T19:00:00+09:00'), endMs: ms('2026-10-12T19:30:00+09:00') },
      withinBookingWindow: allowed,
    });
  });
});

describe('US-18 / 검색 후보의 커넥터·거리·기존 제한', () => {
  it('AC-18-4 추가 확정 / GIVEN 정확히1000m 적격 DC콤보 WHEN 반경1km 검색 THEN 포함', () => {
    const input = candidate({ distanceMeters: 1000 });
    expect(publicRule('filterMcpChargerCandidates')({ candidates: [input], connector: 'DC콤보', range, occupancies: [] })).toEqual([input]);
  });
  it('AC-18-4 추가 확정 / GIVEN 거리·식별자 혼합순서 WHEN 검색 THEN 거리·statId·chgerId 순서', () => {
    const far = candidate({ charger: { statId: 'A', chgerId: '01' }, distanceMeters: 999 });
    const b = candidate({ charger: { statId: 'B', chgerId: '01' }, distanceMeters: 100 });
    const a2 = candidate({ charger: { statId: 'A', chgerId: '02' }, distanceMeters: 100 });
    const a1 = candidate({ charger: { statId: 'A', chgerId: '01' }, distanceMeters: 100 });
    expect(publicRule('filterMcpChargerCandidates')({ candidates: [far, b, a2, a1], connector: 'DC콤보', range, occupancies: [] })).toEqual([a1, a2, b, far]);
  });
  it.each(['04', '05', '06', '08', '10'] as const)
  ('AC-18-1·4 / AC-02-6·7 DC콤보 부분 / GIVEN 적격 %s WHEN DC콤보 검색 THEN 후보 포함', (chargerType) => {
    const input = candidate({ chargerType });
    expect(publicRule('filterMcpChargerCandidates')({ candidates: [input], connector: 'DC콤보', range, occupancies: [] })).toEqual([input]);
  });
  it.each(['01', '11'] as const)
  ('AC-18-1·4 / AC-02-6·7 DC콤보 부분 / GIVEN %s WHEN DC콤보 검색 THEN 불일치 후보 제외', (chargerType) => {
    expect(publicRule('filterMcpChargerCandidates')({ candidates: [candidate({ chargerType })], connector: 'DC콤보', range, occupancies: [] })).toEqual([]);
  });
  it.each([[999, true], [1001, false]] as const)
  ('AC-18-4 / GIVEN 거리 %sm WHEN 반경1km 검색 THEN 포함 %s', (distanceMeters, included) => {
    const input = candidate({ distanceMeters });
    expect(publicRule('filterMcpChargerCandidates')({ candidates: [input], connector: 'DC콤보', range, occupancies: [] })).toEqual(included ? [input] : []);
  });
  it('AC-18-1·4 / AC-02-8 제한 전달 부분 / GIVEN 커넥터 일치·기존 자격 실패 WHEN 검색 THEN 제외', () => {
    expect(publicRule('filterMcpChargerCandidates')({
      candidates: [candidate({ existingEligibilityPassed: false })], connector: 'DC콤보', range, occupancies: [],
    })).toEqual([]);
  });
  it.each(['confirmed', 'valid-hold'] as const)
  ('AC-18-1·4 / AC-04-3 / GIVEN 같은 충전기 겹치는 %s WHEN 검색 THEN 제외', (kind) => {
    const occupancies: Occupancy[] = [{ charger, kind, range: {
      startMs: ms('2026-10-12T19:15:00+09:00'), endMs: ms('2026-10-12T19:45:00+09:00'),
    } }];
    expect(publicRule('filterMcpChargerCandidates')({ candidates: [candidate()], connector: 'DC콤보', range, occupancies })).toEqual([]);
  });
  it.each([
    ['2026-10-12T18:30:00+09:00', '2026-10-12T19:00:00+09:00'],
    ['2026-10-12T19:30:00+09:00', '2026-10-12T20:00:00+09:00'],
  ])('AC-18-1·4 / AC-04-3 / GIVEN 같은 충전기 연속구간 %s~%s WHEN 검색 THEN 포함', (start, end) => {
    const input = candidate();
    const occupancies: Occupancy[] = [{ charger, kind: 'confirmed', range: { startMs: ms(start), endMs: ms(end) } }];
    expect(publicRule('filterMcpChargerCandidates')({ candidates: [input], connector: 'DC콤보', range, occupancies })).toEqual([input]);
  });
  it.each([
    { statId: 'other_station', chgerId: '01' },
    { statId: 'fixture_station', chgerId: '02' },
  ])('AC-18-1·4 / AC-04-3 / GIVEN 다른 충전기 %j 동일구간 WHEN 검색 THEN 포함', (otherCharger) => {
    const input = candidate();
    expect(publicRule('filterMcpChargerCandidates')({ candidates: [input], connector: 'DC콤보', range,
      occupancies: [{ charger: otherCharger, range, kind: 'confirmed' }],
    })).toEqual([input]);
  });
});

describe('US-18 / 10분 점유와 인간 승인 없는 링크 요청', () => {
  it.each([[599999, false], [600000, true], [600001, true]] as const)
  ('AC-18-1·5 / AC-05-3 / GIVEN 10시 점유 WHEN +%sms THEN 정확10분기한·만료 %s', (elapsedMs, isExpired) => {
    expect(publicRule('getMcpHoldTiming')({ createdAtMs, nowMs: createdAtMs + elapsedMs })).toEqual({ expiresAtMs: holdExpiresAtMs, isExpired });
  });
  it.each([undefined, { approved: true }])
  ('AC-18-2 / GIVEN 승인파일 없음 WHEN 승인주장 %j THEN 요약·승인명령만 반환', (claimedApproval) => {
    expect(publicRule('evaluateMcpPaymentLinkRequest')({
      holdId: 'hold-001', charger, range, nowMs: createdAtMs + 599999,
      holdExpiresAtMs, claimedApproval,
    }, { approvalFileExists: false, approvalHoldId: null })).toEqual({
      linkAllowed: false, holdExpired: false,
      summary: { holdId: 'hold-001', charger, range, amount: 3000, currency: 'KRW', holdExpiresAtMs },
      approvalCommand: 'npm run approve -- hold-001', effects: [],
    });
  });
  // adapter가 보호된 파일에서 읽은 결과라는 fixture 전제. 실제 파일/폴더 접근 없음.
  // create-payment-link는 생성 요청 판정일 뿐 URL 생성·결제 완료·예약 확정이 아니다.
  it('AC-18-7 파일승인 순수 부분 / GIVEN 해당 점유 승인파일 존재 WHEN 만료1ms전 THEN 링크생성효과1건', () => {
    expect(publicRule('evaluateMcpPaymentLinkRequest')({
      holdId: 'hold-001', charger, range, nowMs: createdAtMs + 599999, holdExpiresAtMs,
    }, { approvalFileExists: true, approvalHoldId: 'hold-001' })).toEqual({
      linkAllowed: true, holdExpired: false,
      summary: { holdId: 'hold-001', charger, range, amount: 3000, currency: 'KRW', holdExpiresAtMs },
      approvalCommand: 'npm run approve -- hold-001',
      effects: [{ type: 'create-payment-link', holdId: 'hold-001', amount: 3000, currency: 'KRW', expiresAtMs: holdExpiresAtMs }],
    });
  });
  it.each([600000, 600001])
  ('AC-18-5·7 파일승인 순수 부분 / GIVEN 해당 점유 승인파일 존재 WHEN +%sms THEN 링크생성효과없음', (elapsedMs) => {
    expect(publicRule('evaluateMcpPaymentLinkRequest')({
      holdId: 'hold-001', charger, range, nowMs: createdAtMs + elapsedMs, holdExpiresAtMs,
    }, { approvalFileExists: true, approvalHoldId: 'hold-001' })).toEqual({
      linkAllowed: false, holdExpired: true,
      summary: { holdId: 'hold-001', charger, range, amount: 3000, currency: 'KRW', holdExpiresAtMs },
      approvalCommand: 'npm run approve -- hold-001', effects: [],
    });
  });
  it('AC-18-2·7 파일승인 순수 부분 / GIVEN 다른 점유 승인파일 WHEN 유효점유 링크요청 THEN 생성효과없음', () => {
    expect(publicRule('evaluateMcpPaymentLinkRequest')({
      holdId: 'hold-001', charger, range, nowMs: createdAtMs + 599999, holdExpiresAtMs,
    }, { approvalFileExists: true, approvalHoldId: 'hold-other' })).toEqual({
      linkAllowed: false, holdExpired: false,
      summary: { holdId: 'hold-001', charger, range, amount: 3000, currency: 'KRW', holdExpiresAtMs },
      approvalCommand: 'npm run approve -- hold-001', effects: [],
    });
  });
});

describe('US-18 / 기발급 링크의 순수 기한 검사', () => {
  // GIVEN 기발급 링크·다른 권한조건 충족. true는 생성 승인·실제 URL 사용 성공이 아니다.
  // 실제 서버가 이 판정을 호출해 사용을 막는 통합 검증은 별도 NOT_RUN.
  it.each([
    ['2026-10-12T10:09:59.999+09:00', '2026-10-12T10:10:00+09:00', true],
    ['2026-10-12T10:10:00.000+09:00', '2026-10-12T10:10:00+09:00', false],
    ['2026-10-12T10:10:00.001+09:00', '2026-10-12T10:10:00+09:00', false],
    ['2026-10-12T10:10:00+09:00', '2026-10-12T10:15:00+09:00', false],
    ['2026-10-12T10:05:00+09:00', '2026-10-12T10:05:00+09:00', false],
  ] as const)('AC-18-5 / WHEN 현재%s GIVEN 점유기한10:10·링크기한%s THEN 기간유효 %s', (now, linkExpiry, usable) => {
    expect(publicRule('isMcpPaymentLinkUsable')({ nowMs: ms(now), holdExpiresAtMs, linkExpiresAtMs: ms(linkExpiry) })).toBe(usable);
  });
});
