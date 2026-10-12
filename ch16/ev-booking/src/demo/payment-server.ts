import { createServer } from 'node:http';
import type { Server } from 'node:http';
import { readFileSync, mkdirSync, writeFileSync, renameSync, existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { join, resolve } from 'node:path';
import { validatePaymentApprovalRequest, reduceVerifiedPaymentApproval } from '../rules/payment.ts';
import type { PaymentState, Payment } from '../rules/payment.ts';
import { demoReservationRange, selectDemoCharger, demoLinkedSlotAvailable } from '../rules/demo-order.ts';
import type { DemoCharger } from '../rules/demo-order.ts';
import type { ConnectorKind } from '../rules/types.ts';
import { mergeMcpStatuses, mcpHoldAccess } from '../rules/mcp-service.ts';
import { evaluateMcpPaymentLinkRequest } from '../rules/mcp-booking.ts';
import { BookingError, identifierSchema, readApproval, readState, serialize } from '../mcp/storage.ts';
import type { StoredHold } from '../mcp/storage.ts';
import type { BookingOptions } from '../mcp/booking-service.ts';

export interface PaymentDemoOptions extends BookingOptions {
  clientKey: string;
  toss: (path: string, body: object, idempotencyKey: string) => Promise<{ ok: boolean; status: number; data: unknown }>;
}
type Stage = 'pending' | 'approving' | 'confirmed' | 'failed' | 'review' | 'refund-pending' | 'refunded';
interface Order {
  id: string; owner: string; customerKey: string; station: DemoCharger;
  holdId?: string; connector?: ConnectorKind;
  startMs: number; endMs: number; createdAtMs: number; state: PaymentState;
  stage: Stage; code?: string; message?: string; paymentKey?: string; providerStatus?: string;
}
const object = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const reasons: Record<string, string> = {
  APPROVAL_REQUIRED: '이 점유의 결제 링크 사용 승인이 없습니다. 터미널에서 승인한 뒤 다시 열어 주세요.',
  HOLD_EXPIRED: '10분 임시 점유가 만료되어 결제를 진행할 수 없습니다.',
  UNKNOWN_HOLD: '요청한 임시 점유를 찾을 수 없습니다.',
  FORBIDDEN: '이 임시 점유를 조회할 권한이 없습니다.',
  INVALID_ARGUMENTS: '올바른 임시 점유 식별자가 필요합니다.',
  UNKNOWN_CHARGER: '주문의 충전기 정보를 찾을 수 없습니다.',
  STORAGE_ERROR: '저장된 주문 또는 점유 정보를 확인할 수 없습니다.',
  LOCAL_SERVER_ERROR: '주문을 준비하지 못했습니다. 서버 상태를 확인해 주세요.',
};
const errorStatus: Record<string, number> = { APPROVAL_REQUIRED: 403, HOLD_EXPIRED: 410,
  UNKNOWN_HOLD: 404, FORBIDDEN: 403, INVALID_ARGUMENTS: 400, UNKNOWN_CHARGER: 404 };
function deniedHtml(code: string): string {
  // HTML contains fixed server-owned strings only.
  const message = reasons[code] ?? reasons.LOCAL_SERVER_ERROR;
  const shownCode = reasons[code] ? code : 'LOCAL_SERVER_ERROR';
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>결제를 진행할 수 없습니다 · EV Booking</title><link rel="icon" href="data:,"><link rel="stylesheet" href="/style.css"></head><body><main><section class="card"><h1>결제를 진행할 수 없습니다</h1><p role="alert">${message}</p><p class="small">${shownCode}</p><p class="small">결제 승인이나 예약 확정을 처리하지 않았습니다.</p></section></main></body></html>`;
}
function safeCode(value: unknown) {
  return typeof value === 'string' && /^[A-Z][A-Z0-9_]{0,127}$/.test(value) ? value : 'PROVIDER_ERROR';
}
function safeMessage(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  return value.replace(/[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/g, ' ')
    .replace(/(?:test|live)_(?:gck|gsk|ck|sk)_[A-Za-z0-9_-]+/g, '[키 숨김]')
    .replace(/\b(?:Basic|Bearer)\s+[A-Za-z0-9+/=_-]+/gi, '[인증 정보 숨김]')
    .replace(/(?:paymentKey|authKey|clientKey|secretKey|token)\s*[=:]\s*[^\s,;]+/gi, '[식별 정보 숨김]')
    .replace(/https?:\/\/[^\s<>]+/gi, '[주소 생략]').trim().slice(0, 500) || undefined;
}

/** Factory import has no secret access, listener or provider call. Options are trusted configuration. */
export async function createPaymentDemoServer(options: PaymentDemoOptions): Promise<Server> {
  const root = resolve(options.projectRoot);
  const now = () => {
    const value = options.now();
    if (!Number.isSafeInteger(value)) throw new BookingError('INVALID_ARGUMENTS');
    return value;
  };
  const dataDir = join(root, '.local/payment-demo');
  mkdirSync(dataDir, { recursive: true, mode: 0o700 });
  const stateFile = join(dataDir, 'orders.json');
  const orders: Order[] = existsSync(stateFile) ? JSON.parse(readFileSync(stateFile, 'utf8')) : [];
  // Preserve the legacy single-driver demo and previously saved customer/order identifiers.
  const driverFile = join(dataDir, 'driver.json');
  const driver: { id: string } = existsSync(driverFile)
    ? JSON.parse(readFileSync(driverFile, 'utf8')) : { id: orders.find(o => !o.holdId)?.owner ?? randomUUID() };
  writeFileSync(driverFile, JSON.stringify(driver), { mode: 0o600 });
  function persist() {
    const tmp = join(dataDir, 'orders.tmp');
    writeFileSync(tmp, JSON.stringify(orders), { mode: 0o600 });
    renameSync(tmp, stateFile);
  }
  for (const order of orders) {
    if (order.stage === 'approving' || order.stage === 'refund-pending') {
      order.stage = 'review'; order.code = 'INTERRUPTED_REQUEST';
    }
  }
  persist();
  const records = mergeMcpStatuses(
    JSON.parse(await readFile(join(options.sourceDataDir, 'stations.json'), 'utf8')),
    JSON.parse(await readFile(join(options.sourceDataDir, 'status.json'), 'utf8')),
  );
  const station = selectDemoCharger(records as unknown as DemoCharger[]);
  function publicOrder(order: Order) {
    return { orderId: order.id, holdId: order.holdId, customerKey: order.customerKey,
      orderName: `${order.station.statNm} 가상 예약금`,
      station: { name: order.station.statNm, address: order.station.addr, chargerId: order.station.chgerId,
        connector: order.connector ?? 'DC콤보', output: order.station.output, updatedAt: order.station.statUpdDt },
      startMs: order.startMs, endMs: order.endMs, expiresAtMs: order.state.expiresAtMs, nowMs: now(),
      amount: order.state.amountKrw, stage: order.stage, code: order.code, message: safeMessage(order.message),
      reservationCount: order.state.reservationCount, chargedAmount: order.state.chargedAmountKrw,
      refundedAmount: order.state.refundedAmountKrw, refundRequestedAmount: order.state.refundRequestedAmountKrw,
      providerStatus: order.providerStatus };
  }
  async function ownedHold(id: string): Promise<StoredHold> {
    if (!identifierSchema.safeParse(id).success) throw new BookingError('INVALID_ARGUMENTS');
    const hold = (await readState(root)).holds.find(h => h.holdId === id);
    const error = mcpHoldAccess(hold, options.actorId);
    if (error || !hold) throw new BookingError(error ?? 'UNKNOWN_HOLD');
    return hold;
  }
  async function linkHold(id: string): Promise<StoredHold> {
    const hold = await ownedHold(id);
    const approval = await readApproval(root, id);
    const decision = evaluateMcpPaymentLinkRequest({ holdId: id, charger: hold.charger,
      range: hold.range, nowMs: now(), holdExpiresAtMs: hold.expiresAtMs },
    { approvalFileExists: approval !== null, approvalHoldId: approval?.holdId ?? null });
    if (decision.holdExpired) throw new BookingError('HOLD_EXPIRED');
    if (!decision.linkAllowed) throw new BookingError('APPROVAL_REQUIRED');
    return hold;
  }
  function newOrder(charger: DemoCharger, range: { startMs: number; endMs: number },
    owner: string, createdAtMs: number, expiresAtMs: number, holdId?: string, connector?: ConnectorKind): Order {
    const id = `ev_${randomUUID()}`;
    return { id, owner, customerKey: randomUUID(), station: charger, ...range, createdAtMs,
      holdId, connector, stage: 'pending', state: { orderId: id, amountKrw: 3000, currency: 'KRW', expiresAtMs,
        slotAvailable: true, processedPaymentKeys: [], reservationCount: 0, chargedAmountKrw: 0,
        refundRequestedAmountKrw: 0, refundedAmountKrw: 0 } };
  }
  async function linkedOrder(id: string): Promise<Order> {
    return serialize(root, async () => {
      const hold = await linkHold(id);
      const existing = orders.find(o => o.holdId === id);
      if (existing) {
        if (existing.owner !== options.actorId) throw new BookingError('FORBIDDEN');
        return existing;
      }
      const charger = records.find(s => s.statId === hold.charger.statId && s.chgerId === hold.charger.chgerId);
      if (!charger) throw new BookingError('UNKNOWN_CHARGER');
      const order = newOrder(charger as unknown as DemoCharger, hold.range, hold.actorId,
        hold.createdAtMs, hold.expiresAtMs, id, hold.connector);
      orders.push(order); persist(); return order;
    });
  }
  const accessible = (order: Order) => order.owner === (order.holdId ? options.actorId : driver.id);
  const locks = new Map<string, Promise<void>>();
  async function withOrderLock<T>(id: string, work: () => Promise<T>): Promise<T> {
    const previous = locks.get(id) ?? Promise.resolve();
    let release!: () => void;
    const pending = new Promise<void>(done => { release = done; });
    locks.set(id, pending);
    await previous;
    try { return await work(); }
    finally { release(); if (locks.get(id) === pending) locks.delete(id); }
  }
  async function confirm(order: Order, body: { orderId: string; amount: number; paymentKey: string }) {
    if (!validatePaymentApprovalRequest(order.state, body)) return { status: 400, body: { error: 'INVALID_ORDER_AMOUNT' } };
    if (typeof body.paymentKey !== 'string' || !/^[A-Za-z0-9_-]{1,200}$/.test(body.paymentKey))
      return { status: 400, body: { error: 'INVALID_PAYMENT_KEY' } };
    if (order.paymentKey && order.paymentKey !== body.paymentKey) return { status: 409, body: { error: 'PAYMENT_KEY_CONFLICT' } };
    if (order.stage !== 'pending') return { status: 200, body: publicOrder(order) };
    order.stage = 'approving'; order.paymentKey = body.paymentKey; persist();
    try {
      const result = await options.toss('/confirm', { orderId: order.id, amount: order.state.amountKrw, paymentKey: body.paymentKey }, `confirm_${order.id}`);
      const raw = object(result.data);
      if (!result.ok) {
        order.stage = result.status >= 500 ? 'review' : 'failed'; order.code = safeCode(raw.code);
        order.message = safeMessage(raw.message); persist();
        return { status: 200, body: publicOrder(order) };
      }
      if (raw.paymentKey !== body.paymentKey || raw.orderId !== order.id || raw.totalAmount !== order.state.amountKrw
        || raw.currency !== 'KRW' || raw.method !== '카드' || raw.status !== 'DONE'
        || typeof raw.approvedAt !== 'string') {
        order.stage = 'review'; order.code = 'UNEXPECTED_PAYMENT_RESPONSE'; persist();
        return { status: 200, body: publicOrder(order) };
      }
      const payment: Payment = { paymentKey: body.paymentKey, orderId: order.id, totalAmount: order.state.amountKrw,
        currency: raw.currency, method: raw.method, status: raw.status, approvedAt: raw.approvedAt };
      const state = await readState(root);
      const checkedAtMs = now();
      const linkedHold = state.holds.find(hold => hold.holdId === order.holdId);
      // Both entry routes use the same qualification, occupancy and account-limit rules.
      // Legacy browser identifiers remain unchanged; its single demo driver is the trusted actor.
      order.state = { ...order.state, slotAvailable:
        (!order.holdId || mcpHoldAccess(linkedHold, options.actorId) === null)
        && demoLinkedSlotAvailable({ actorId: order.holdId ? order.owner : options.actorId,
          charger: { statId: order.station.statId, chgerId: order.station.chgerId },
          connector: order.connector ?? 'DC콤보', range: { startMs: order.startMs, endMs: order.endMs } }, records,
        orders.filter(other => other.id !== order.id).map(other => ({
          owner: other.holdId ? other.owner : options.actorId, stage: other.stage,
          charger: { statId: other.station.statId, chgerId: other.station.chgerId },
          range: { startMs: other.startMs, endMs: other.endMs },
        })), state.holds.filter(hold => hold.holdId !== order.holdId), checkedAtMs) };
      const reduced = reduceVerifiedPaymentApproval(order.state, payment, checkedAtMs);
      order.state = reduced.state; order.providerStatus = payment.status;
      if (reduced.effects.some(e => e.type === 'confirm-reservation')) { order.stage = 'confirmed'; persist(); }
      else if (reduced.effects.some(e => e.type === 'request-refund')) {
        order.stage = 'refund-pending'; persist();
        const canceled = await options.toss(`/${encodeURIComponent(body.paymentKey)}/cancel`, {
          cancelReason: '시연 예약 점유 만료 또는 자리 확보 실패', cancelAmount: order.state.amountKrw,
        }, `refund_${order.id}`);
        const refund = object(canceled.data);
        const refunded = canceled.ok && refund.paymentKey === body.paymentKey && refund.orderId === order.id
          && refund.status === 'CANCELED' && refund.totalAmount === order.state.amountKrw
          && refund.balanceAmount === 0 && Array.isArray(refund.cancels)
          && refund.cancels.some(c => object(c).cancelStatus === 'DONE' && object(c).cancelAmount === order.state.amountKrw);
        if (refunded) { order.stage = 'refunded'; order.state = { ...order.state, refundedAmountKrw: order.state.amountKrw }; }
        else {
          order.stage = 'review'; order.code = canceled.ok ? 'UNEXPECTED_REFUND_RESPONSE' : safeCode(refund.code);
          order.message = canceled.ok ? undefined : safeMessage(refund.message);
        }
        persist();
      } else { order.stage = 'review'; order.code = 'UNEXPECTED_RULE_RESULT'; persist(); }
    } catch {
      order.stage = 'review'; order.code = 'REQUEST_OUTCOME_UNKNOWN'; persist();
    }
    return { status: 200, body: publicOrder(order) };
  }
  const assets = new Map([['/', ['index.html', 'text/html']], ['/success', ['index.html', 'text/html']],
    ['/fail', ['index.html', 'text/html']], ['/result', ['index.html', 'text/html']],
    ['/app.js', ['app.js', 'text/javascript']], ['/style.css', ['style.css', 'text/css']]]);
  const server = createServer(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store'); res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Content-Type-Options', 'nosniff'); res.setHeader('X-Frame-Options', 'DENY');
    const json = (status: number, body: unknown) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(body)); };
    let pageRequest = false;
    try {
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('NOT_LISTENING');
      const origins = [`http://localhost:${address.port}`, `http://127.0.0.1:${address.port}`];
      if (!origins.some(origin => req.headers.host === new URL(origin).host)) return json(403, { error: 'LOCAL_HOST_REQUIRED' });
      const url = new URL(req.url ?? '/', origins[0]);
      pageRequest = req.method === 'GET' && url.pathname.startsWith('/payment/');
      if (req.method === 'POST') {
        if (!origins.includes(req.headers.origin ?? '')) return json(403, { error: 'ORIGIN_REJECTED' });
        if (!req.headers['content-type']?.startsWith('application/json')) return json(415, { error: 'JSON_REQUIRED' });
      }
      const linked = url.pathname.match(/^\/(api\/)?payment\/([^/]+)$/);
      if (req.method === 'GET' && linked) {
        const id = decodeURIComponent(linked[2]);
        if (linked[1]) return json(200, publicOrder(await linkedOrder(id)));
        await linkHold(id);
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(readFileSync(new URL('public/index.html', import.meta.url))); return;
      }
      if (req.method === 'GET' && url.pathname === '/api/config') return json(200, { clientKey: options.clientKey });
      if (req.method === 'GET' && url.pathname === '/api/order') {
        const order = orders.find(o => o.id === url.searchParams.get('orderId') && accessible(o));
        if (order?.holdId) await ownedHold(order.holdId);
        return order ? json(200, publicOrder(order)) : json(404, { error: 'ORDER_NOT_FOUND' });
      }
      if (req.method === 'POST' && url.pathname === '/api/order') {
        const active = orders.find(o => o.stage === 'confirmed' || o.stage === 'review' || o.stage === 'approving'
          || o.stage === 'refund-pending' || (o.stage === 'pending' && now() < o.state.expiresAtMs));
        if (active) {
          if (!accessible(active)) return json(409, { error: 'DEMO_ORDER_IN_USE' });
          if (active.holdId && active.stage === 'pending') await linkHold(active.holdId);
          return json(200, publicOrder(active));
        }
        if (!station) throw new BookingError('UNKNOWN_CHARGER');
        const time = now();
        const order = newOrder(station, demoReservationRange(time), driver.id, time, time + 600000);
        orders.push(order); persist(); return json(200, publicOrder(order));
      }
      if (req.method === 'POST' && url.pathname === '/api/confirm') {
        let text = ''; for await (const chunk of req) { text += chunk; if (text.length > 8192) return json(413, { error: 'BODY_TOO_LARGE' }); }
        const body = JSON.parse(text);
        const order = orders.find(o => o.id === body.orderId && accessible(o));
        if (!order) return json(404, { error: 'ORDER_NOT_FOUND' });
        const result = await withOrderLock(order.id, async () => {
          if (order.holdId) {
            await ownedHold(order.holdId);
            // An authenticated late payment still reaches the existing full-refund rule.
            if (!await readApproval(root, order.holdId)) throw new BookingError('APPROVAL_REQUIRED');
          }
          return confirm(order, body);
        });
        return json(result.status, result.body);
      }
      const asset = assets.get(url.pathname);
      if (req.method === 'GET' && asset) {
        res.writeHead(200, { 'Content-Type': `${asset[1]}; charset=utf-8` });
        res.end(readFileSync(new URL(`public/${asset[0]}`, import.meta.url))); return;
      }
      json(404, { error: 'NOT_FOUND' });
    } catch (error) {
      const code = error instanceof BookingError ? error.code : 'LOCAL_SERVER_ERROR';
      const status = errorStatus[code] ?? 500;
      if (!res.headersSent) {
        if (pageRequest) { res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(deniedHtml(code)); }
        else json(status, { error: code, message: reasons[code] ?? reasons.LOCAL_SERVER_ERROR });
      } else res.end();
    }
  });
  return server;
}
