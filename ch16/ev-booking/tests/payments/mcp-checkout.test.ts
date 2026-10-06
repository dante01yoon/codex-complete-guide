import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createBookingService } from '../../src/mcp/booking-server.js';
import type { BookingDependencies, Hold } from '../../src/mcp/booking-server.js';
import { localDemoDependencies } from '../../src/mcp/stdio.js';

/**
 * 사용자 확인된 docs/mcp-checkout-integration-plan.md의 8개 계약.
 * AC-18-13/14는 이번 연결의 추가 기준이며 기존 AC-18-11을 변경하지 않는다.
 * 실제 MCP 서비스 → 공유 파일 쓰기 → 독립 checkout 읽기/HTML/결제 직전 판정을 검증한다.
 * 승인 파일 존재·시계·계정만 주입한다. 승인 CLI·실제 승인 폴더·키·토스 API는 사용하지 않는다.
 * HTTP 라우팅·실제 SDK 렌더·최종 승인/환불은 별도 통합/브라우저 검증 범위다.
 *
 * 구현할 공개 경계:
 * - stdio.ts: createSharedCheckoutDependencies(base, sharedFile) → BookingDependencies
 * - payments/mcp-checkout.ts: createMcpCheckout(options) → Checkout
 * 프로덕션 모듈은 지연 로드한다. 모듈/공개 함수 부재는 준비 미완료이고 기능 RED 증거가 아니다.
 * 사용자 확인 뒤 공개 인터페이스 준비와 실제 기능 RED를 구분해야 한다.
 */
interface CheckoutOrder {
  orderId: string;
  holdId: string;
  amount: number;
  mode: 'test';
  hold: Hold;
  stationName: string;
}
interface Checkout {
  getOrder(orderId: string): Promise<CheckoutOrder | undefined>;
  renderCheckout(orderId: string): Promise<{ code: string; html: string }>;
  preparePayment(orderId: string): Promise<{ ok: boolean; code: string }>;
}
interface CheckoutOptions {
  projectDirectory: string;
  dataDirectory: string;
  sharedFile: string;
  now(): number;
  approvalFiles: BookingDependencies['approvalFiles'];
  clientKey: string;
}
type SharedDependencies = (base: BookingDependencies, sharedFile: string) => BookingDependencies;
type CheckoutFactory = (options: CheckoutOptions) => Checkout;

const CREATED = Date.parse('2026-10-06T18:00:00+09:00');
const START = Date.parse('2026-10-06T19:00:00+09:00');
const EXPIRES = CREATED + 600_000;
const directories: string[] = [];
const network = vi.fn(() => { throw new Error('외부 결제 API 호출 금지'); });

async function loadFunction<T>(path: string, exportName: string): Promise<T> {
  const url = new URL(path, import.meta.url);
  expect(existsSync(url), `${path}: 공개 인터페이스 준비 필요 (기능 RED 아님)`).toBe(true);
  const module = await import(url.href) as Record<string, unknown>;
  expect(module[exportName], `${exportName}: 공개 인터페이스 준비 필요 (기능 RED 아님)`)
    .toBeTypeOf('function');
  return module[exportName] as T;
}

async function fixture() {
  const directory = await mkdtemp(resolve(tmpdir(), 'ev-mcp-checkout-'));
  directories.push(directory);
  const sharedFile = resolve(directory, 'booking-runtime.json');
  const stations = [
    { statId: 'station-a', chgerId: '01', statNm: '강남 시연 충전소', addr: '서울 강남구',
      lat: '37.4982', lng: '127.0277', chgerType: '04', useTime: '24시간 이용가능',
      limitYn: 'N', delYn: 'N', stat: '2', statUpdDt: '20261006170000' },
    { statId: 'station-b', chgerId: '02', statNm: '서초 시연 충전소', addr: '서울 서초구',
      lat: '37.4910', lng: '127.0070', chgerType: '04', useTime: '24시간 이용가능',
      limitYn: 'N', delYn: 'N', stat: '2', statUpdDt: '20261006170000' },
  ];
  await writeFile(resolve(directory, 'stations.json'), JSON.stringify(stations), 'utf8');
  await writeFile(resolve(directory, 'status.json'), '[]', 'utf8');
  const clock = { now: CREATED };
  const actor = { userId: 'driver-a', role: 'driver' };
  const approved = new Set<string>();
  let sequence = 0;
  const approvalFiles = {
    exists: vi.fn(async (path: string) => approved.has(path)),
  };
  const approvalFor = (id: string) => resolve(directory, '.codex', 'approvals', id);
  const base: BookingDependencies = {
    ...localDemoDependencies(directory),
    projectDirectory: directory, dataDirectory: directory,
    readJson: async path => JSON.parse(await readFile(path, 'utf8')) as unknown,
    now: () => clock.now, getActor: () => actor,
    newHoldId: () => `hold-checkout-${++sequence}`, approvalFiles,
  };
  const createSharedDependencies = await loadFunction<SharedDependencies>(
    '../../src/mcp/stdio.ts', 'createSharedCheckoutDependencies');
  // 실제 파일 쓰기는 프로덕션 런타임을 통한다. 저장 로직을 테스트에 복제하지 않는다.
  const dependencies = createSharedDependencies(base, sharedFile);
  const service = createBookingService(dependencies);
  const createCheckout = await loadFunction<CheckoutFactory>(
    '../../src/payments/mcp-checkout.ts', 'createMcpCheckout');
  const options: CheckoutOptions = {
    projectDirectory: directory, dataDirectory: directory, sharedFile,
    now: () => clock.now, approvalFiles,
    // 가짜 공개 키이다. 실제 키·시크릿이나 .env는 읽지 않는다.
    clientKey: 'test_gck_fixture_not_a_real_key',
  };
  const reader = () => createCheckout(options);
  async function issue(statId = 'station-a', chgerId = '01', startMs = START) {
    const held = await service.holdSlot({ statId, chgerId, connector: 'DC콤보',
      startMs, durationMinutes: 60 });
    expect(held.ok).toBe(true);
    if (!held.ok) throw new Error('테스트 점유 생성 실패');
    approved.add(approvalFor(held.hold.id));
    const result = await service.requestPayment({ holdId: held.hold.id });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('테스트 링크 발급 실패');
    expect(result.amount).toBe(3000);
    expect(result.mode).toBe('test');
    const url = new URL(result.url);
    expect(url.origin).toBe('http://127.0.0.1:5180');
    expect(url.pathname).toMatch(/^\/checkout\/[^/]+$/);
    return { orderId: decodeURIComponent(url.pathname.slice('/checkout/'.length)), hold: held.hold };
  }
  return { directory, sharedFile, clock, actor, approved, approvalFor,
    approvalFiles, dependencies, reader, issue };
}

function expectBlocked(result: { code: string; html: string }, code: string, reason: RegExp) {
  expect(result.code).toBe(code);
  expect(result.html).toMatch(reason);
  expect(result.html).not.toMatch(/js\.tosspayments\.com|TossPayments\s*\(|widgets\.requestPayment/);
  expect(result.html).not.toMatch(/id=["'](?:pay|payment-method|agreement)["']/);
}
function expectReady(result: { code: string; html: string }) {
  expect(result.code).toBe('READY');
  expect(result.html).toContain('3,000원');
  expect(result.html).toContain('https://js.tosspayments.com/v2/standard');
  expect(result.html).toMatch(/widgets\.setAmount\(/);
  expect(result.html).toMatch(/value\s*:\s*3000/);
  expect(result.html).toContain('payment-method');
  expect(result.html).toContain('테스트');
}

beforeEach(() => {
  network.mockClear();
  vi.stubGlobal('fetch', network);
});
afterEach(async () => {
  try {
    expect(network).not.toHaveBeenCalled();
    // 실제 프로젝트 승인 경로가 아닌, 이 테스트가 만든 임시 디렉터리만 검사/정리한다.
    for (const directory of directories) {
      expect(existsSync(resolve(directory, '.codex', 'approvals'))).toBe(false);
    }
  } finally {
    vi.unstubAllGlobals();
    await Promise.all(directories.splice(0).map(directory => rm(directory, { recursive: true, force: true })));
  }
});

describe('16장 MCP 공유 파일 → 15장 checkout 연결 (테스트 키·모의 승인)', () => {
  // 검출: URL 발급 후 주문·점유 대응 누락, 조회 시 점유 재생성.
  it('AC-18-13 MCP 링크의 주문번호로 같은 점유를 조회한다', async () => {
    const f = await fixture();
    const issued = await f.issue();
    const before = await readFile(f.sharedFile, 'utf8');
    const order = await f.reader().getOrder(issued.orderId);
    expect(order).toMatchObject({ orderId: issued.orderId, holdId: issued.hold.id,
      amount: 3000, mode: 'test', stationName: '강남 시연 충전소',
      hold: { id: issued.hold.id, userId: 'driver-a', statId: 'station-a', chgerId: '01',
        connector: 'DC콤보', startMs: START, endMs: START + 3_600_000,
        createdMs: CREATED, expiresMs: EXPIRES } });
    await f.reader().renderCheckout(issued.orderId);
    expect(await readFile(f.sharedFile, 'utf8')).toBe(before);
    expect(f.dependencies.store.holds.size).toBe(1);
    expect(f.dependencies.store.confirmedReservations).toHaveLength(0);
  });

  // 검출: 합성 충전소·시간 사용, 금액 오류, 마지막 유효 1ms를 만료로 판정.
  it('AC-18-13 승인된 유효 주문에 충전소와 서울 예약 시간과 3000원 위젯을 표시한다', async () => {
    const f = await fixture();
    const { orderId, hold } = await f.issue();
    f.clock.now = EXPIRES - 1;
    f.approvalFiles.exists.mockClear();
    const result = await f.reader().renderCheckout(orderId);
    expectReady(result);
    expect(result.html).toContain('강남 시연 충전소');
    expect(result.html).toContain('서울');
    expect(result.html).toMatch(/2026[.\-/년\s]+10[.\-/월\s]+0?6/);
    expect(result.html).toContain('19:00');
    expect(result.html).toContain('20:00');
    expect(f.approvalFiles.exists).toHaveBeenCalledWith(f.approvalFor(hold.id));
  });

  // 검출: 저장한 승인 여부 재사용, 다른 holdId의 승인 사용, 승인 파일 자체 생성.
  it('AC-18-14 승인 없는 주문은 이유만 표시한다', async () => {
    const f = await fixture();
    const { orderId } = await f.issue();
    const before = await readFile(f.sharedFile, 'utf8');
    f.approved.clear();
    for (const otherApproval of [false, true]) {
      if (otherApproval) f.approved.add(f.approvalFor('hold-someone-else'));
      expectBlocked(await f.reader().renderCheckout(orderId), 'APPROVAL_REQUIRED', /승인/);
    }
    expect(await readFile(f.sharedFile, 'utf8')).toBe(before);
    expect(f.dependencies.store.confirmedReservations).toHaveLength(0);
  });

  // 검출: 정확히 만료 시각에 허용, 화면 조회로 점유 기한 연장.
  it('AC-18-14 정확히 점유 만료 시각과 이후에는 위젯을 표시하지 않는다', async () => {
    const f = await fixture();
    const { orderId, hold } = await f.issue();
    const before = await readFile(f.sharedFile, 'utf8');
    for (const now of [EXPIRES, EXPIRES + 1]) {
      f.clock.now = now;
      expectBlocked(await f.reader().renderCheckout(orderId), 'HOLD_EXPIRED', /만료/);
    }
    expect(await readFile(f.sharedFile, 'utf8')).toBe(before);
    expect(f.dependencies.store.holds.get(hold.id)?.expiresMs).toBe(EXPIRES);
  });

  // 검출: 비동기 승인 확인 뒤 만료 재검사 누락.
  it('AC-18-14 승인 파일 확인 도중 만료되면 위젯을 표시하지 않는다', async () => {
    const f = await fixture();
    const { orderId, hold } = await f.issue();
    f.clock.now = EXPIRES - 1;
    f.approvalFiles.exists.mockImplementationOnce(async path => {
      expect(path).toBe(f.approvalFor(hold.id));
      f.clock.now = EXPIRES;
      return true;
    });
    expectBlocked(await f.reader().renderCheckout(orderId), 'HOLD_EXPIRED', /만료/);
    expect(f.dependencies.store.holds.get(hold.id)?.expiresMs).toBe(EXPIRES);
  });

  // 검출: 불명 주문을 demo 주문으로 대체, 손상 파일을 무시하고 결제 화면 생성.
  it('AC-18-14 알 수 없는 주문과 손상된 점유 정보는 결제를 막는다', async () => {
    const f = await fixture();
    const { orderId } = await f.issue();
    const before = await readFile(f.sharedFile, 'utf8');
    expectBlocked(await f.reader().renderCheckout('unknown-order'), 'ORDER_UNAVAILABLE', /주문/);
    expect(await readFile(f.sharedFile, 'utf8')).toBe(before);
    for (const corrupt of ['{broken-json', JSON.stringify({ orders: [], holds: 'invalid' })]) {
      await writeFile(f.sharedFile, corrupt, 'utf8');
      expectBlocked(await f.reader().renderCheckout(orderId), 'DATA_UNAVAILABLE', /정보|조회|읽|확인/);
      expect(await readFile(f.sharedFile, 'utf8')).toBe(corrupt);
    }
    await rm(f.sharedFile);
    expectBlocked(await f.reader().renderCheckout(orderId), 'DATA_UNAVAILABLE', /정보|조회|읽|확인/);
    expect(existsSync(f.sharedFile)).toBe(false);
    expect(f.dependencies.store.holds.size).toBe(1);
    expect(f.dependencies.store.confirmedReservations).toHaveLength(0);
  });

  // 검출: 화면 표시 시의 승인·기한만 사용하고 결제 직전 확인 생략.
  it('AC-18-14 결제 직전에 승인 제거와 점유 만료를 재검사한다', async () => {
    const f = await fixture();
    const { orderId, hold } = await f.issue();
    const app = f.reader();
    expectReady(await app.renderCheckout(orderId));
    expect(await app.preparePayment(orderId)).toMatchObject({ ok: true, code: 'READY' });
    const before = await readFile(f.sharedFile, 'utf8');
    f.approved.clear();
    expect(await app.preparePayment(orderId)).toMatchObject({ ok: false, code: 'APPROVAL_REQUIRED' });
    f.approved.add(f.approvalFor(hold.id));
    f.clock.now = EXPIRES;
    expect(await app.preparePayment(orderId)).toMatchObject({ ok: false, code: 'HOLD_EXPIRED' });
    expect(await readFile(f.sharedFile, 'utf8')).toBe(before);
    expect(f.dependencies.store.confirmedReservations).toHaveLength(0);
    expect(network).not.toHaveBeenCalled();
  });

  // 검출: 전역 stationName/startMs 사용으로 마지막 주문이 이전 화면을 덮어씀.
  it('AC-18-13 두 주문은 각자의 충전소와 예약 시간을 표시한다', async () => {
    const f = await fixture();
    const first = await f.issue();
    f.actor.userId = 'driver-b';
    const second = await f.issue('station-b', '02', START + 7_200_000);
    expect(second.orderId).not.toBe(first.orderId);
    const app = f.reader();
    const firstPage = await app.renderCheckout(first.orderId);
    const secondPage = await app.renderCheckout(second.orderId);
    expectReady(firstPage);
    expectReady(secondPage);
    expect(firstPage.html).toContain('강남 시연 충전소');
    expect(firstPage.html).toContain('19:00');
    expect(firstPage.html).toContain('20:00');
    expect(firstPage.html).not.toContain('서초 시연 충전소');
    expect(secondPage.html).toContain('서초 시연 충전소');
    expect(secondPage.html).toContain('21:00');
    expect(secondPage.html).toContain('22:00');
    expect(secondPage.html).not.toContain('강남 시연 충전소');
    // 두 번째 주문을 표시한 뒤에도 첫 번째 주문 대응을 유지한다.
    expect(await app.getOrder(first.orderId)).toMatchObject({ holdId: first.hold.id,
      hold: { userId: 'driver-a', statId: 'station-a', startMs: START } });
    expect(await app.getOrder(second.orderId)).toMatchObject({ holdId: second.hold.id,
      hold: { userId: 'driver-b', statId: 'station-b', startMs: START + 7_200_000 } });
  });
});
