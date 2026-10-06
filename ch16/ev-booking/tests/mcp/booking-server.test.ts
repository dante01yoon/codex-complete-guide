import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createBookingService, registerBookingTools } from '../../src/mcp/booking-server.js';
import { runApprovalCommand } from '../../src/mcp/approve.js';
import type { ConnectorKind } from '../../src/rules/types.js';

/**
 * T-50~53 / AC-18-1~10: 사용자 검토용 공개 API 제안. 아직 실행하지 않았다.
 * createBookingService({dataDirectory, readJson, now, getActor, newHoldId, store,
 *   projectDirectory, approvalFiles, createPaymentLink})는 아래 세 메서드를 제공한다.
 * searchChargers(input) => {ok:true, chargers: Charger[]};
 * holdSlot(input) => {ok:true, hold: Hold}; requestPayment({holdId}) =>
 * {ok:true, url:string, amount:3000, mode:'test'}; 거절은 {ok:false}를 포함한다.
 * 승인 파일 부재는 {ok:false, error:{code:'APPROVAL_REQUIRED'}, summary,
 *   approvalCommand:'npm run approve -- <holdId>'}를 반환한다.
 * summary의 제안 형태는 {stationId,stationName,start,end,timeZone,amount}이며
 * start/end는 서울 오프셋의 ISO 문자열이다. 다른 오류 코드/문구는 고정하지 않는다.
 * store.transaction은 원자적 명령의 기술 경계이며 실제 영속 저장을 정하지 않는다.
 * registerBookingTools는 SDK와 같은 registerTool(name, config, handler) 경계를 쓴다.
 * approvalFiles.exists(path)/create(path)는 메모리 Set으로만 모의한다.
 * 서버는 exists만 사용하며 미래 사람용 CLI runApprovalCommand(argv, dependencies)는
 * create를 호출한다. 실제 npm 명령·승인 파일/폴더·stdio·토스는 실행하지 않는다.
 * C-05/11/12 미정 운영시간, 반경 경계/정렬, 파일 내용/소비·재요청은 테스트하지 않는다.
 */
type Charger = {
  statId: string; chgerId: string; statNm: string; addr: string;
  lat: string; lng: string; chgerType: string; useTime: string;
  limitYn: string; delYn: string; stat: string; statUpdDt: string;
};
type Status = Pick<Charger, 'statId' | 'chgerId' | 'stat' | 'statUpdDt'>;
type Hold = {
  id: string; userId: string; statId: string; chgerId: string;
  connector: ConnectorKind; startMs: number; endMs: number;
  createdMs: number; expiresMs: number;
};
type Reservation = {
  id: string; userId: string; statId: string; chgerId: string;
  startMs: number; endMs: number;
};
type LinkRequest = { holdId: string; userId: string; amount: number; mode: 'test' };
type ToolHandler = (input: Record<string, unknown>) => Promise<unknown>;
type ToolConfig = { description?: string; inputSchema: Record<string, unknown> };

const NOW = Date.parse('2026-10-06T18:00:00+09:00');
const START = Date.parse('2026-10-06T19:00:00+09:00');
const MINUTE = 60_000;
const PROJECT_DIRECTORY = process.cwd();
const DATA_DIRECTORY = resolve(process.cwd(), '../ev-map/data');
const SEARCH = { latitude: 37.498095, longitude: 127.02761, radiusMeters: 1000, connector: 'DC콤보' as const };
const SLOT = { statId: 'near-04', chgerId: '01', connector: 'DC콤보' as const, startMs: START, durationMinutes: 30 };

function charger(statId = 'near-04', overrides: Partial<Charger> = {}): Charger {
  return {
    statId, chgerId: '01', statNm: '시연 충전소', addr: '서울 강남구 시연 주소',
    lat: '37.4982', lng: '127.0277', chgerType: '04', useTime: '24시간 이용가능',
    limitYn: 'N', delYn: 'N', stat: '2', statUpdDt: '20261006170000', ...overrides,
  };
}

const INELIGIBLE: [string, Partial<Charger>][] = [
  ['이용 제한', { limitYn: 'Y' }],
  ['삭제', { delYn: 'Y' }],
  ['09:00~18:00 운영', { useTime: '09:00~18:00' }],
  ['고장 4', { stat: '4' }],
  ['점검 5', { stat: '5' }],
  ['상태 불명 1', { stat: '1' }],
  ['상태 불명 9', { stat: '9' }],
  ['해석 불가 상태', { stat: 'unrecognized' }],
];

function harness(stations: Charger[] = [charger()], statuses: Status[] = []) {
  let currentMs = NOW;
  const actor = { userId: 'driver-a', role: 'driver' as const };
  let serial = 0;
  let queue: Promise<unknown> = Promise.resolve();
  const store = {
    holds: new Map<string, Hold>(),
    confirmedReservations: [] as Reservation[],
    blockedChargers: new Set<string>(),
    // 테스트용 직렬 transaction. 자격/겹침/만료 규칙은 여기 구현하지 않는다.
    transaction<T>(work: () => T | Promise<T>): Promise<T> {
      const result = queue.then(work);
      queue = result.then(() => undefined, () => undefined);
      return result;
    },
  };
  const readJson = vi.fn(async (path: string): Promise<unknown> => {
    if (path === resolve(DATA_DIRECTORY, 'stations.json')) return stations;
    if (path === resolve(DATA_DIRECTORY, 'status.json')) return statuses;
    throw new Error('Unexpected fixture data path');
  });
  // 보호 경로는 실제 파일 시스템에서 읽거나 생성하지 않는다.
  const approvalPaths = new Set<string>();
  const approvalFiles = {
    exists: vi.fn(async (path: string) => approvalPaths.has(path)),
    create: vi.fn(async (path: string) => { approvalPaths.add(path); }),
  };
  const createPaymentLink = vi.fn(async (_request: LinkRequest) => 'http://localhost:8765/test-checkout/mock-order');
  const dependencies = {
    dataDirectory: DATA_DIRECTORY, readJson,
    now: () => currentMs,
    getActor: () => actor,
    newHoldId: () => `hold-${++serial}`,
    store, projectDirectory: PROJECT_DIRECTORY, approvalFiles, createPaymentLink,
  };
  const service = createBookingService(dependencies);
  return {
    service, store, readJson, approvalPaths, approvalFiles, createPaymentLink,
    setNow: (ms: number) => { currentMs = ms; },
    asUser: (userId: string) => createBookingService({ ...dependencies, getActor: () => ({ userId, role: 'driver' as const }) }),
  };
}

function existingHold(overrides: Partial<Hold> = {}): Hold {
  return {
    id: 'existing-hold', userId: 'driver-b', statId: SLOT.statId, chgerId: SLOT.chgerId,
    connector: 'DC콤보', startMs: START, endMs: START + 60 * MINUTE,
    createdMs: NOW, expiresMs: NOW + 10 * MINUTE, ...overrides,
  };
}

function expectNoPaymentOrConfirmation(h: ReturnType<typeof harness>) {
  expect(h.createPaymentLink).not.toHaveBeenCalled();
  expect(h.store.confirmedReservations).toHaveLength(0);
  expect(fetch).not.toHaveBeenCalled();
}

function expectSuccess<T extends { ok: boolean }>(result: T): asserts result is T & { ok: true } {
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error('Expected successful service result');
}

function approvalPath(holdId: string): string {
  return resolve(PROJECT_DIRECTORY, '.codex', 'approvals', holdId);
}

beforeEach(() => {
  // 실제 HTTP 요청은 허용하지 않는다. 호출 자체도 아래 afterEach에서 실패한다.
  vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('Real network is outside this test'); }));
});
afterEach(() => {
  try { expect(fetch).not.toHaveBeenCalled(); }
  finally { vi.unstubAllGlobals(); }
});

describe('T-50~52 로컬 예약 MCP 서비스와 도구', () => {
  it('AC-18-1 세 도구의 입력 스키마와 서비스 핸들러를 연결한다', async () => {
    const calls = new Map<string, { config: ToolConfig; handler: ToolHandler }>();
    const fakeService = {
      searchChargers: vi.fn(async (_input: unknown) => ({ ok: true as const, chargers: [] })),
      holdSlot: vi.fn(async (_input: unknown) => ({ ok: true as const, hold: existingHold() })),
      requestPayment: vi.fn(async (_input: unknown) => ({ ok: false as const })),
    };
    const registrar = {
      registerTool: vi.fn((name: string, config: ToolConfig, handler: ToolHandler) => {
        calls.set(name, { config, handler });
      }),
    };
    registerBookingTools(registrar, fakeService);
    expect(registrar.registerTool).toHaveBeenCalledTimes(3);
    expect([...calls.keys()].sort()).toEqual(['hold_slot', 'request_payment', 'search_chargers']);
    for (const [name, required] of [
      ['search_chargers', ['latitude', 'longitude', 'radiusMeters', 'connector']],
      ['hold_slot', ['statId', 'chgerId', 'connector', 'startMs', 'durationMinutes']],
      ['request_payment', ['holdId']],
    ] as const) {
      const entry = calls.get(name)!;
      expect(entry.config.description).toEqual(expect.any(String));
      expect(Object.keys(entry.config.inputSchema)).toEqual(expect.arrayContaining([...required]));
      expect(entry.handler).toEqual(expect.any(Function));
    }
    await calls.get('search_chargers')!.handler(SEARCH);
    await calls.get('hold_slot')!.handler(SLOT);
    await calls.get('request_payment')!.handler({ holdId: 'existing-hold' });
    expect(fakeService.searchChargers).toHaveBeenCalledWith(SEARCH);
    expect(fakeService.holdSlot).toHaveBeenCalledWith(SLOT);
    expect(fakeService.requestPayment).toHaveBeenCalledWith({ holdId: 'existing-hold' });
  });

  it('AC-18-2 반경 안 DC콤보 04/06/10을 반환하고 먼 충전기와 01을 제외한다', async () => {
    const h = harness([
      charger(), charger('near-06', { chgerType: '06' }), charger('near-10', { chgerType: '10' }),
      charger('far', { lat: '37.6', lng: '127.2' }), charger('chademo-only', { chgerType: '01' }),
    ]);
    const result = await h.service.searchChargers(SEARCH);
    expectSuccess(result);
    // 결과 정렬을 제품 정책으로 정하지 않는다.
    expect(result.chargers.map((c: Charger) => c.statId).sort()).toEqual(['near-04', 'near-06', 'near-10']);
    expect(h.readJson).toHaveBeenCalledWith(resolve(DATA_DIRECTORY, 'stations.json'));
    expect(h.readJson).toHaveBeenCalledWith(resolve(DATA_DIRECTORY, 'status.json'));
    expect(h.store.holds.size).toBe(0);
    expectNoPaymentOrConfirmation(h);
  });

  it.each(INELIGIBLE)('AC-18-3 검색에서 %s 충전기를 제외한다', async (_label, overrides) => {
    const h = harness([charger('eligible'), charger('excluded', overrides)]);
    const result = await h.service.searchChargers(SEARCH);
    expectSuccess(result);
    expect(result.chargers.map((c: Charger) => c.statId)).toEqual(['eligible']);
  });

  it('AC-18-3 검색에서 운영자 차단을 제외하고 충전중 3을 허용한다', async () => {
    const h = harness([charger('blocked'), charger('charging', { stat: '3' })]);
    h.store.blockedChargers.add('blocked:01');
    const result = await h.service.searchChargers(SEARCH);
    expectSuccess(result);
    expect(result.chargers.map((c: Charger) => c.statId)).toEqual(['charging']);
  });

  it.each([
    ['최신 고장으로 제외', '2', '20261006180000', '4', false],
    ['최신 복구로 포함', '4', '20261006180000', '2', true],
    ['오래된 고장으로 덮어쓰지 않음', '2', '20261006160000', '4', true],
    ['유효하지 않은 갱신 시각 무시', '2', 'invalid-date', '4', true],
  ] as const)('AC-18-3 상태 병합: %s', async (_label, original, updatedAt, updated, included) => {
    const h = harness([charger('merge', { stat: original })], [
      { statId: 'merge', chgerId: '01', stat: updated, statUpdDt: updatedAt },
    ]);
    const result = await h.service.searchChargers(SEARCH);
    expectSuccess(result);
    expect(result.chargers.map((c: Charger) => c.statId)).toEqual(included ? ['merge'] : []);
  });

  it('AC-18-3 상태 병합에서 다른 chgerId 변경분을 적용하지 않는다', async () => {
    const h = harness([charger('merge')], [
      { statId: 'merge', chgerId: '02', stat: '4', statUpdDt: '20261006180000' },
    ]);
    const result = await h.service.searchChargers(SEARCH);
    expectSuccess(result);
    expect(result.chargers).toHaveLength(1);
  });

  it.each([
    ['현재 시작', NOW, 30],
    ['당일 19:00 시작', START, 30],
    ['19:30·60분', START + 30 * MINUTE, 60],
    ['정확히 7일·종료는 7일 초과', NOW + 7 * 24 * 60 * MINUTE, 90],
  ] as const)('AC-18-4 적격 시간 허용: %s', async (_label, startMs, durationMinutes) => {
    const h = harness();
    const result = await h.service.holdSlot({ ...SLOT, startMs, durationMinutes });
    expectSuccess(result);
    expect(result.hold).toMatchObject({
      userId: 'driver-a', statId: SLOT.statId, chgerId: SLOT.chgerId,
      connector: 'DC콤보', startMs, endMs: startMs + durationMinutes * MINUTE,
    });
    expect(h.store.holds.size).toBe(1);
    expectNoPaymentOrConfirmation(h);
  });

  it.each([
    ['현재 이전', NOW - 30 * MINUTE, 30],
    ['7일 초과', NOW + (7 * 24 * 60 + 30) * MINUTE, 30],
    ['15분 시작', START + 15 * MINUTE, 30],
    ['00분이나 1초 포함', START + 1000, 30],
    ['00분이나 1밀리초 포함', START + 1, 30],
    ['15분 이용', START, 15],
    ['45분 이용', START, 45],
    ['120분 이용', START, 120],
  ] as const)('AC-18-4 부적격 시간 거절: %s', async (_label, startMs, durationMinutes) => {
    const h = harness();
    expect(await h.service.holdSlot({ ...SLOT, startMs, durationMinutes })).toMatchObject({ ok: false });
    expect(h.store.holds.size).toBe(0);
    expectNoPaymentOrConfirmation(h);
  });

  it.each(INELIGIBLE)('AC-18-4 점유에서 %s 충전기를 거절한다', async (_label, overrides) => {
    const h = harness([charger(SLOT.statId, overrides)]);
    expect(await h.service.holdSlot(SLOT)).toMatchObject({ ok: false });
    expect(h.store.holds.size).toBe(0);
  });

  it('AC-18-4 점유에서 커넥터 불일치를 거절한다', async () => {
    const h = harness([charger(SLOT.statId, { chgerType: '01' })]);
    expect(await h.service.holdSlot(SLOT)).toMatchObject({ ok: false });
    expect(h.store.holds.size).toBe(0);
  });

  it('AC-18-4 점유에서 운영자 차단을 거절한다', async () => {
    const h = harness();
    h.store.blockedChargers.add(`${SLOT.statId}:${SLOT.chgerId}`);
    expect(await h.service.holdSlot(SLOT)).toMatchObject({ ok: false });
    expect(h.store.holds.size).toBe(0);
  });

  it('AC-18-4 점유에서도 최신 고장 상태를 반영한다', async () => {
    const h = harness([charger()], [
      { statId: SLOT.statId, chgerId: SLOT.chgerId, stat: '4', statUpdDt: '20261006180000' },
    ]);
    expect(await h.service.holdSlot(SLOT)).toMatchObject({ ok: false });
    expect(h.store.holds.size).toBe(0);
  });

  it.each(['확정 예약', '유효 임시 점유'] as const)('AC-18-5 %s와 겹치는 구간을 거절한다', async (kind) => {
    const h = harness();
    if (kind === '확정 예약') {
      h.store.confirmedReservations.push({
        id: 'reservation-b', userId: 'driver-b', statId: SLOT.statId, chgerId: SLOT.chgerId,
        startMs: START, endMs: START + 60 * MINUTE,
      });
    } else h.store.holds.set('existing-hold', existingHold());
    const initialHolds = h.store.holds.size;
    expect(await h.service.holdSlot({ ...SLOT, startMs: START + 30 * MINUTE })).toMatchObject({ ok: false });
    expect(h.store.holds.size).toBe(initialHolds);
  });

  it('AC-18-5 종료와 시작이 맞닿은 연속 구간은 허용한다', async () => {
    const h = harness();
    h.store.holds.set('existing-hold', existingHold());
    expect(await h.service.holdSlot({ ...SLOT, startMs: START + 60 * MINUTE })).toMatchObject({ ok: true });
    expect(h.store.holds.size).toBe(2);
  });

  it('AC-18-5 다른 chgerId의 같은 시간은 겹침으로 거절하지 않는다', async () => {
    const h = harness();
    h.store.holds.set('existing-hold', existingHold({ chgerId: '02' }));
    expect(await h.service.holdSlot(SLOT)).toMatchObject({ ok: true });
  });

  it('AC-18-5 두 사용자 동시 요청은 성공 1건과 유효 점유 1건만 만든다', async () => {
    const h = harness();
    const serviceB = h.asUser('driver-b');
    const results = await Promise.all([h.service.holdSlot(SLOT), serviceB.holdSlot(SLOT)]);
    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(results.filter((result) => !result.ok)).toHaveLength(1);
    expect(h.store.holds.size).toBe(1);
    expectNoPaymentOrConfirmation(h);
  });

  it('AC-18-6 점유 기한은 생성 시각부터 정확히 600000ms이며 결제와 확정은 없다', async () => {
    const h = harness();
    const result = await h.service.holdSlot(SLOT);
    expectSuccess(result);
    expect(result.hold).toMatchObject({ createdMs: NOW, expiresMs: NOW + 600_000 });
    expect(h.store.holds.get(result.hold.id)).toMatchObject(result.hold);
    expectNoPaymentOrConfirmation(h);
  });

  it.each([
    ['18:09:59에는 충돌 유지', NOW + 599_000, false],
    ['18:10:00에는 충돌 해제', NOW + 600_000, true],
  ] as const)('AC-18-6 만료 경계: %s', async (_label, nowMs, allowed) => {
    const h = harness();
    h.store.holds.set('existing-hold', existingHold());
    h.setNow(nowMs);
    const result = await h.service.holdSlot(SLOT);
    expect(result.ok).toBe(allowed);
    const active = [...h.store.holds.values()].filter((hold) => hold.expiresMs > nowMs);
    expect(active).toHaveLength(1);
    if (allowed) expect(active[0]?.userId).toBe('driver-a');
    expectNoPaymentOrConfirmation(h);
  });

  it('AC-18-7 승인 파일이 없으면 APPROVAL_REQUIRED와 서울 예약 요약 및 승인 명령을 반환한다', async () => {
    const h = harness();
    h.store.holds.set('own-hold', existingHold({ id: 'own-hold', userId: 'driver-a' }));
    expect(await h.service.requestPayment({ holdId: 'own-hold' })).toMatchObject({
      ok: false,
      error: { code: 'APPROVAL_REQUIRED' },
      summary: {
        stationId: SLOT.statId, stationName: '시연 충전소',
        start: '2026-10-06T19:00:00+09:00', end: '2026-10-06T20:00:00+09:00',
        timeZone: 'Asia/Seoul', amount: 3000,
      },
      approvalCommand: 'npm run approve -- own-hold',
    });
    expect(h.approvalFiles.exists).toHaveBeenCalledWith(approvalPath('own-hold'));
    expect(h.approvalFiles.create).not.toHaveBeenCalled();
    expect(h.approvalPaths.size).toBe(0);
    expectNoPaymentOrConfirmation(h);
  });

  it('AC-18-7 입력 approved=true는 사람 승인을 대체하지 못한다', async () => {
    const h = harness();
    h.store.holds.set('own-hold', existingHold({ id: 'own-hold', userId: 'driver-a' }));
    // 실제 도구 경계로 보내 모델이 추가한 approved를 검사한다.
    const handlers = new Map<string, ToolHandler>();
    registerBookingTools({ registerTool: (name: string, _config: ToolConfig, handler: ToolHandler) => {
      handlers.set(name, handler);
    } }, h.service);
    // 추가 입력은 거절해도 무시해도 된다. 어느 경우든 승인 없이 링크를 만들 수 없다.
    await Promise.allSettled([handlers.get('request_payment')!({ holdId: 'own-hold', approved: true })]);
    expect(h.approvalFiles.create).not.toHaveBeenCalled();
    expect(h.approvalPaths.size).toBe(0);
    expectNoPaymentOrConfirmation(h);
  });

  it('AC-18-8 해당 점유 승인 파일 확인 후 3000원 테스트 링크만 반환한다', async () => {
    const h = harness();
    h.store.holds.set('own-hold', existingHold({ id: 'own-hold', userId: 'driver-a' }));
    h.approvalPaths.add(approvalPath('own-hold'));
    const result = await h.service.requestPayment({ holdId: 'own-hold' });
    expect(h.approvalFiles.exists).toHaveBeenCalledWith(approvalPath('own-hold'));
    expect(h.createPaymentLink).toHaveBeenCalledOnce();
    expect(h.createPaymentLink).toHaveBeenCalledWith(expect.objectContaining({
      holdId: 'own-hold', userId: 'driver-a', amount: 3000, mode: 'test',
    }));
    expect(h.approvalFiles.exists.mock.invocationCallOrder[0]).toBeLessThan(h.createPaymentLink.mock.invocationCallOrder[0]!);
    expect(result).toMatchObject({
      ok: true, url: 'http://localhost:8765/test-checkout/mock-order', amount: 3000, mode: 'test',
    });
    expect(h.store.confirmedReservations).toHaveLength(0);
    expect(h.store.holds.get('own-hold')).toMatchObject({ expiresMs: NOW + 600_000 });
    expect(h.approvalFiles.create).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('AC-18-8 다른 holdId의 승인 파일은 현재 점유를 승인하지 않는다', async () => {
    const h = harness();
    h.store.holds.set('own-hold', existingHold({ id: 'own-hold', userId: 'driver-a' }));
    h.approvalPaths.add(approvalPath('different-hold'));
    expect(await h.service.requestPayment({ holdId: 'own-hold' })).toMatchObject({
      ok: false, error: { code: 'APPROVAL_REQUIRED' },
    });
    expect(h.approvalFiles.exists).toHaveBeenCalledWith(approvalPath('own-hold'));
    expectNoPaymentOrConfirmation(h);
  });

  it('AC-18-8 승인 파일 확인 중 정확히 만료되면 링크를 만들거나 기한을 연장하지 않는다', async () => {
    const h = harness();
    const hold = existingHold({ id: 'own-hold', userId: 'driver-a' });
    h.store.holds.set(hold.id, hold);
    h.approvalPaths.add(approvalPath(hold.id));
    h.setNow(NOW + 599_999);
    h.approvalFiles.exists.mockImplementation(async (path: string) => {
      h.setNow(NOW + 600_000);
      return h.approvalPaths.has(path);
    });
    expect(await h.service.requestPayment({ holdId: hold.id })).toMatchObject({ ok: false });
    expect(h.approvalFiles.exists).toHaveBeenCalledWith(approvalPath(hold.id));
    const retainedHold = h.store.holds.get(hold.id);
    // 만료 기록 정리 여부는 미정이므로 삭제/유지를 모두 허용한다. 기한 연장만 금지한다.
    if (retainedHold) expect(retainedHold.expiresMs).toBe(NOW + 600_000);
    expect(h.approvalFiles.create).not.toHaveBeenCalled();
    expectNoPaymentOrConfirmation(h);
  });

  it('AC-18-8 도구 입력 amount=1로 서버 예약금 3000원을 바꾸지 못한다', async () => {
    const h = harness();
    h.store.holds.set('own-hold', existingHold({ id: 'own-hold', userId: 'driver-a' }));
    h.approvalPaths.add(approvalPath('own-hold'));
    const handlers = new Map<string, ToolHandler>();
    registerBookingTools({ registerTool: (name: string, _config: ToolConfig, handler: ToolHandler) => {
      handlers.set(name, handler);
    } }, h.service);
    await Promise.allSettled([handlers.get('request_payment')!({ holdId: 'own-hold', amount: 1 })]);
    // 추가 입력 거절 또는 무시 중 어느 방식을 선택해도 청구 금액은 바뀌지 않는다.
    for (const [request] of h.createPaymentLink.mock.calls) expect(request.amount).toBe(3000);
    expect(h.store.confirmedReservations).toHaveLength(0);
  });

  it('AC-18-9 타인 점유 결제 요청은 링크와 개인 예약 정보를 반환하지 않는다', async () => {
    const h = harness();
    const privateHold = existingHold({ id: 'private-hold', userId: 'private-driver-b' });
    h.store.holds.set(privateHold.id, privateHold);
    h.approvalPaths.add(approvalPath(privateHold.id));
    const result = await h.service.requestPayment({ holdId: privateHold.id });
    expect(result).toMatchObject({ ok: false });
    expect(JSON.stringify(result)).not.toContain(privateHold.userId);
    expect(JSON.stringify(result)).not.toContain(String(privateHold.startMs));
    expect(h.store.holds.get(privateHold.id)).toEqual(privateHold);
    expectNoPaymentOrConfirmation(h);
  });

  it.each([
    ['정확히 만료', NOW + 600_000],
    ['만료 후', NOW + 600_001],
  ] as const)('AC-18-9 %s 점유의 결제 링크를 만들지 않는다', async (_label, nowMs) => {
    const h = harness();
    h.store.holds.set('own-hold', existingHold({ id: 'own-hold', userId: 'driver-a' }));
    h.approvalPaths.add(approvalPath('own-hold'));
    h.setNow(nowMs);
    expect(await h.service.requestPayment({ holdId: 'own-hold' })).toMatchObject({ ok: false });
    const retainedHold = h.store.holds.get('own-hold');
    if (retainedHold) expect(retainedHold.expiresMs).toBe(NOW + 600_000);
    expectNoPaymentOrConfirmation(h);
  });

  it.each([false, true])('AC-18-10 서버의 승인 파일 확인은 쓰기 0회다 (파일 존재=%s)', async (exists) => {
    const h = harness();
    h.store.holds.set('own-hold', existingHold({ id: 'own-hold', userId: 'driver-a' }));
    if (exists) h.approvalPaths.add(approvalPath('own-hold'));
    const before = [...h.approvalPaths];
    const result = await h.service.requestPayment({ holdId: 'own-hold' });
    expect(result.ok).toBe(exists);
    expect(h.approvalFiles.exists).toHaveBeenCalledWith(approvalPath('own-hold'));
    expect(h.approvalFiles.create).not.toHaveBeenCalled();
    expect([...h.approvalPaths]).toEqual(before);
    expect(h.store.confirmedReservations).toHaveLength(0);
  });

  it('AC-18-10 사람용 approve CLI는 프로젝트의 해당 holdId 파일 생성만 모의 요청한다', async () => {
    // 미래 npm script가 전달할 argv의 계약만 호출한다. 셸/npm/fs는 호출하지 않는다.
    const createdPaths = new Set<string>();
    const approvalFiles = {
      exists: vi.fn(async (path: string) => createdPaths.has(path)),
      create: vi.fn(async (path: string) => { createdPaths.add(path); }),
    };
    await runApprovalCommand(['own-hold'], { projectDirectory: PROJECT_DIRECTORY, approvalFiles });
    expect(approvalFiles.create).toHaveBeenCalledOnce();
    expect(approvalFiles.create).toHaveBeenCalledWith(approvalPath('own-hold'));
    expect([...createdPaths]).toEqual([approvalPath('own-hold')]);
  });
});
