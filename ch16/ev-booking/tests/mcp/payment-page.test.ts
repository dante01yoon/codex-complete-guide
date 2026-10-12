import { access, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { approve, fixture, holdArgs, NOW, productModule, rawCharger, service, START } from './fixtures.js';
import type { Fixture, Options } from './fixtures.js';

// 사용자 테스트 확인 전 실행 금지. 실제 승인 폴더·토스 API 접근 없음.
// 모든 승인 파일은 기존 fixture가 만든 전용 임시 root에만 생성한다.
type Toss = (path: string, body: object, key: string) => Promise<{
  ok: boolean; status: number; data: unknown;
}>;
type Factory = (options: Options & { clientKey: string; toss: Toss }) => Server | Promise<Server>;
interface PublicOrder {
  orderId: string; holdId: string; amount: number; startMs: number; endMs: number;
  expiresAtMs: number; nowMs: number; stage: string; reservationCount: number;
  chargedAmount: number; refundedAmount: number;
  station: { name: string; address: string; chargerId: string; connector: string };
}
const roots: Fixture[] = [];
const servers = new Set<Server>();
async function close(server: Server) {
  await new Promise<void>((resolve, reject) => {
    server.close(error => error ? reject(error) : resolve());
    server.closeAllConnections();
  });
  servers.delete(server);
}
afterEach(async () => {
  try { await Promise.all([...servers].map(close)); }
  finally { await Promise.all(roots.splice(0).map(f => f.clean())); }
});
async function setup(connector: 'DC콤보' | 'NACS' = 'DC콤보') {
  const f = await fixture([rawCharger({ chgerType: connector === 'NACS' ? '10' : '04' })]);
  roots.push(f);
  const booking = await service(f.options);
  const hold = await booking.holdCharger({ ...holdArgs, connector });
  return { f, booking, hold };
}
async function start(f: Fixture, actorId = f.options.actorId) {
  const mod = await productModule('src/demo/payment-server.ts');
  expect(mod.createPaymentDemoServer).toBeTypeOf('function');
  const toss = vi.fn<Toss>(async () => { throw new Error('테스트에서 외부 결제 호출 금지'); });
  const server = await (mod.createPaymentDemoServer as Factory)({ ...f.options, actorId,
    clientKey: 'test_gck_fixture_only', toss });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject); server.listen(0, '127.0.0.1', resolve);
  });
  servers.add(server);
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return { server, toss, get: (path: string) => fetch(`${base}${path}`) };
}
const orderPath = (id: string) => `/api/payment/${encodeURIComponent(id)}`;
const pagePath = (id: string) => `/payment/${encodeURIComponent(id)}`;
const exists = (path: string) => access(path).then(() => true, () => false);
async function storedOrders(f: Fixture): Promise<unknown[]> {
  const path = join(f.projectRoot, '.local/payment-demo/orders.json');
  if (!await exists(path)) return [];
  const orders: unknown = JSON.parse(await readFile(path, 'utf8'));
  expect(Array.isArray(orders)).toBe(true);
  return orders as unknown[];
}

async function denied(response: Response, status: number, code: string, reason: string) {
  expect(response.status).toBe(status);
  expect(response.headers.get('content-type')).toContain('text/html');
  const html = await response.text();
  expect(html).toContain(code); expect(html).toContain(reason);
  expect(html).not.toContain('js.tosspayments.com');
  expect(html).not.toMatch(/id=["'](?:pay|payment-method|agreement)["']/);
  expect(html).not.toContain('3,000원 테스트 결제');
  return html;
}

describe('MCP 결제 링크 / 15장 HTTP 주문 연결 (사용자 확인 대기)', () => {
  it('AC-05-1·6 / AC-18-11 / GIVEN 승인된 유효 점유 WHEN 반환 링크 HTTP 조회 THEN 해당 주문·3000원·미결제', async () => {
    const { f, booking, hold } = await setup('NACS');
    await approve(hold.holdId, f.options);
    const link = await booking.requestPaymentLink({ holdId: hold.holdId });
    expect(link.linkAllowed).toBe(true); expect(link.linkUrl).toBeTruthy();
    const http = await start(f);
    const page = await http.get(new URL(link.linkUrl!).pathname);
    expect(page.status).toBe(200); expect(page.headers.get('content-type')).toContain('text/html');
    expect(await page.text()).toContain('/app.js');
    const response = await http.get(orderPath(hold.holdId)); expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ holdId: hold.holdId, amount: 3000,
      startMs: START, endMs: START + 1800000, expiresAtMs: hold.expiresAtMs,
      nowMs: NOW, stage: 'pending', reservationCount: 0, chargedAmount: 0, refundedAmount: 0,
      station: { name: '시연 충전소', address: '서울 시연 주소', chargerId: '01', connector: 'NACS' } });
    expect(http.toss).not.toHaveBeenCalled();
  });

  it('AC-18-10 / GIVEN 승인 점유 WHEN 동시·반복·서버 재시작 조회 THEN 같은 주문·원래 기한·원본 불변', async () => {
    const { f, hold } = await setup(); await approve(hold.holdId, f.options);
    const stateBefore = await readFile(f.statePath, 'utf8');
    const approvalBefore = await readFile(f.approvalPath(hold.holdId), 'utf8');
    const sourceBefore = await readFile(join(f.sourceDataDir, 'stations.json'), 'utf8');
    const statusBefore = await readFile(join(f.sourceDataDir, 'status.json'), 'utf8');
    const http = await start(f);
    const responses = await Promise.all([http.get(orderPath(hold.holdId)), http.get(orderPath(hold.holdId))]);
    responses.forEach(r => expect(r.status).toBe(200));
    const orders = await Promise.all(responses.map(r => r.json())) as PublicOrder[];
    expect(orders[0].orderId).toBeTruthy(); expect(orders[1].orderId).toBe(orders[0].orderId);
    f.setNow(NOW + 300000);
    const repeated = await http.get(orderPath(hold.holdId)); expect(repeated.status).toBe(200);
    expect(await repeated.json()).toMatchObject({ orderId: orders[0].orderId, expiresAtMs: hold.expiresAtMs });
    await close(http.server);
    const restarted = await start(f);
    const restored = await restarted.get(orderPath(hold.holdId)); expect(restored.status).toBe(200);
    expect(await restored.json()).toMatchObject({ orderId: orders[0].orderId, expiresAtMs: hold.expiresAtMs });
    expect(await storedOrders(f)).toHaveLength(1);
    expect(await readFile(f.statePath, 'utf8')).toBe(stateBefore);
    expect(await readFile(f.approvalPath(hold.holdId), 'utf8')).toBe(approvalBefore);
    expect(await readFile(join(f.sourceDataDir, 'stations.json'), 'utf8')).toBe(sourceBefore);
    expect(await readFile(join(f.sourceDataDir, 'status.json'), 'utf8')).toBe(statusBefore);
    expect(http.toss).not.toHaveBeenCalled(); expect(restarted.toss).not.toHaveBeenCalled();
  });

  it('AC-18-2·7 / GIVEN 승인 없음 WHEN 수동 링크·API 조회 THEN 이유·결제 UI 없음·승인 자동 생성 없음', async () => {
    const { f, hold } = await setup(); const http = await start(f);
    await denied(await http.get(pagePath(hold.holdId)), 403, 'APPROVAL_REQUIRED', '승인');
    const response = await http.get(orderPath(hold.holdId)); expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ error: 'APPROVAL_REQUIRED' });
    expect(await exists(f.approvalPath(hold.holdId))).toBe(false);
    expect(await storedOrders(f)).toEqual([]);
    expect(http.toss).not.toHaveBeenCalled();
  });

  it.each(['malformed', 'different-hold', 'symlink'])('AC-18-7 / GIVEN %s 승인 WHEN HTTP 링크·API 조회 THEN 승인 없는 이유', async kind => {
    const { f, hold } = await setup(); await approve(hold.holdId, f.options);
    const path = f.approvalPath(hold.holdId);
    if (kind === 'symlink') {
      const target = join(f.projectRoot, 'untrusted-approval.json');
      await writeFile(target, JSON.stringify({ holdId: hold.holdId, approvedAtMs: NOW }));
      await rm(path); await symlink(target, path);
    } else {
      await writeFile(path, kind === 'malformed' ? '{invalid'
        : JSON.stringify({ holdId: 'other-hold', approvedAtMs: NOW }));
    }
    const http = await start(f);
    await denied(await http.get(pagePath(hold.holdId)), 403, 'APPROVAL_REQUIRED', '승인');
    const response = await http.get(orderPath(hold.holdId)); expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ error: 'APPROVAL_REQUIRED' });
    expect(await storedOrders(f)).toEqual([]);
    expect(http.toss).not.toHaveBeenCalled();
  });

  it('AC-05-3 / AC-18-5 / GIVEN 승인 점유 WHEN 만료 1ms 전 조회 THEN 원래 기한으로 결제 가능', async () => {
    const { f, hold } = await setup(); await approve(hold.holdId, f.options);
    f.setNow(hold.expiresAtMs - 1); const http = await start(f);
    expect((await http.get(pagePath(hold.holdId))).status).toBe(200);
    const response = await http.get(orderPath(hold.holdId)); expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ expiresAtMs: hold.expiresAtMs, nowMs: hold.expiresAtMs - 1 });
    expect(http.toss).not.toHaveBeenCalled();
  });

  it.each([0, 1])('AC-05-3 / AC-18-5 / GIVEN 발급된 링크 WHEN 만료+%dms 조회 THEN 만료 이유·API도 거절', async delta => {
    const { f, hold } = await setup(); await approve(hold.holdId, f.options);
    const http = await start(f);
    expect((await http.get(orderPath(hold.holdId))).status).toBe(200);
    f.setNow(hold.expiresAtMs + delta);
    await denied(await http.get(pagePath(hold.holdId)), 410, 'HOLD_EXPIRED', '만료');
    const response = await http.get(orderPath(hold.holdId)); expect(response.status).toBe(410);
    expect(await response.json()).toMatchObject({ error: 'HOLD_EXPIRED' });
    expect(http.toss).not.toHaveBeenCalled();
  });

  it('AC-18-2·7 / GIVEN 한번 조회한 주문 WHEN 승인 파일 제거 후 조회 THEN 기존 주문으로 게이트 우회 불가', async () => {
    const { f, hold } = await setup(); await approve(hold.holdId, f.options); const http = await start(f);
    expect((await http.get(orderPath(hold.holdId))).status).toBe(200);
    await rm(f.approvalPath(hold.holdId));
    await denied(await http.get(pagePath(hold.holdId)), 403, 'APPROVAL_REQUIRED', '승인');
    const response = await http.get(orderPath(hold.holdId)); expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ error: 'APPROVAL_REQUIRED' });
    expect(http.toss).not.toHaveBeenCalled();
  });

  it('AC-03-4 / GIVEN 다른 소유자 점유 WHEN 링크 조회 THEN 권한 사유·개인 주문 정보 없음', async () => {
    const { f, hold } = await setup(); await approve(hold.holdId, f.options);
    const http = await start(f, 'test-driver-2');
    const html = await denied(await http.get(pagePath(hold.holdId)), 403, 'FORBIDDEN', '권한');
    expect(html).not.toContain('시연 충전소'); expect(html).not.toContain('서울 시연 주소');
    const response = await http.get(orderPath(hold.holdId)); expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ error: 'FORBIDDEN' });
    expect(http.toss).not.toHaveBeenCalled();
  });

  it('AC-06-2 / GIVEN 없는 점유 WHEN 링크 조회 THEN 없는 이유·기본 시연 주문으로 대체 없음', async () => {
    const { f } = await setup(); const http = await start(f);
    await denied(await http.get('/payment/hold-missing'), 404, 'UNKNOWN_HOLD', '찾을 수');
    const response = await http.get('/api/payment/hold-missing'); expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ error: 'UNKNOWN_HOLD' });
    expect(await storedOrders(f)).toEqual([]);
    expect(http.toss).not.toHaveBeenCalled();
  });
});
