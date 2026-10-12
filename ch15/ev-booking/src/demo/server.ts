import { createServer } from 'node:http';
import { readFileSync, mkdirSync, writeFileSync, renameSync, existsSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { parseEnv } from 'node:util';
import { validatePaymentApprovalRequest, reduceVerifiedPaymentApproval } from '../rules/payment.ts';
import type { PaymentState, Payment } from '../rules/payment.ts';
import { demoReservationRange, selectDemoCharger } from '../rules/demo-order.ts';
import type { DemoCharger } from '../rules/demo-order.ts';

const root = new URL('../../', import.meta.url);
const env = parseEnv(readFileSync(new URL('.env', root), 'utf8'));
const clientKey = env.TOSS_CLIENT_KEY ?? '';
const secretKey = env.TOSS_SECRET_KEY ?? '';
if (!/^test_gck_[A-Za-z0-9_-]+$/.test(clientKey) || !/^test_gsk_[A-Za-z0-9_-]+$/.test(secretKey)) {
  console.error('토스 위젯용 테스트 키가 필요합니다. .env를 확인하세요.');
  process.exit(1);
}
const origin = 'http://localhost:5180';
const dataDir = new URL('.local/payment-demo/', root);
mkdirSync(dataDir, { recursive: true, mode: 0o700 });
const stateFile = new URL('orders.json', dataDir);
type Stage = 'pending' | 'approving' | 'confirmed' | 'failed' | 'review' | 'refund-pending' | 'refunded';
interface Order {
  id: string; owner: string; customerKey: string; station: DemoCharger;
  startMs: number; endMs: number; createdAtMs: number; state: PaymentState;
  stage: Stage; code?: string; message?: string; paymentKey?: string; providerStatus?: string;
}
const orders: Order[] = existsSync(stateFile) ? JSON.parse(readFileSync(stateFile, 'utf8')) : [];
// 승인한 단일 운전자 시연에서는 로컬 브라우저들이 같은 주문을 본다.
// 실제 로그인·다중 계정 권한 기능을 제공하는 서버가 아니다.
const driverFile = new URL('driver.json', dataDir);
const driver: { id: string } = existsSync(driverFile)
  ? JSON.parse(readFileSync(driverFile, 'utf8')) : { id: orders[0]?.owner ?? randomUUID() };
writeFileSync(driverFile, JSON.stringify(driver), { mode: 0o600 });
function persist() {
  const tmp = new URL('orders.tmp', dataDir);
  writeFileSync(tmp, JSON.stringify(orders), { mode: 0o600 });
  renameSync(tmp, stateFile);
}
// 중단된 외부 처리는 재전송하지 않고 응답 불명으로 표시한다.
for (const order of orders) {
  if (order.stage === 'approving' || order.stage === 'refund-pending') {
    order.stage = 'review'; order.code = 'INTERRUPTED_REQUEST';
  }
}
persist();
const stations = JSON.parse(readFileSync(new URL('../ev-map/data/stations.json', root), 'utf8')) as DemoCharger[];
const changes = JSON.parse(readFileSync(new URL('../ev-map/data/status.json', root), 'utf8')) as DemoCharger[];
const statusMap = new Map<string, DemoCharger>();
const validStamp = (x: string) => /^\d{14}$/.test(x) && Number.isFinite(Date.parse(`${x.slice(0,4)}-${x.slice(4,6)}-${x.slice(6,8)}T${x.slice(8,10)}:${x.slice(10,12)}:${x.slice(12,14)}+09:00`));
for (const change of changes) {
  const key = `${change.statId}:${change.chgerId}`;
  const old = statusMap.get(key);
  if (validStamp(change.statUpdDt) && (!old || change.statUpdDt > old.statUpdDt)) statusMap.set(key, change);
}
const station = selectDemoCharger(stations.map(s => {
  const change = statusMap.get(`${s.statId}:${s.chgerId}`);
  return change && validStamp(change.statUpdDt) && (!validStamp(s.statUpdDt) || change.statUpdDt > s.statUpdDt)
    ? { ...s, stat: change.stat, statUpdDt: change.statUpdDt } : s;
}));
if (!station) throw new Error('명확한 예약 자격의 DC콤보 시연 후보가 없습니다.');
function publicOrder(o: Order) {
  return { orderId: o.id, customerKey: o.customerKey, orderName: `${o.station.statNm} 가상 예약금`,
    station: { name: o.station.statNm, address: o.station.addr, chargerId: o.station.chgerId,
      connector: 'DC콤보', output: o.station.output, updatedAt: o.station.statUpdDt },
    startMs: o.startMs, endMs: o.endMs, expiresAtMs: o.state.expiresAtMs, nowMs: Date.now(),
    amount: o.state.amountKrw, stage: o.stage, code: o.code, message: safeMessage(o.message),
    reservationCount: o.state.reservationCount, chargedAmount: o.state.chargedAmountKrw,
    refundedAmount: o.state.refundedAmountKrw, refundRequestedAmount: o.state.refundRequestedAmountKrw,
    providerStatus: o.providerStatus };
}
function safeCode(x: unknown) {
  return typeof x === 'string' && /^[A-Z][A-Z0-9_]{0,127}$/.test(x) ? x : 'PROVIDER_ERROR';
}
function safeMessage(x: unknown): string | undefined {
  if (typeof x !== 'string') return undefined;
  return x.replace(/[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/g, ' ')
    .replace(/(?:test|live)_(?:gck|gsk|ck|sk)_[A-Za-z0-9_-]+/g, '[키 숨김]')
    .replace(/\b(?:Basic|Bearer)\s+[A-Za-z0-9+/=_-]+/gi, '[인증 정보 숨김]')
    .replace(/(?:paymentKey|authKey|clientKey|secretKey|token)\s*[=:]\s*[^\s,;]+/gi, '[식별 정보 숨김]')
    .replace(/https?:\/\/[^\s<>]+/gi, '[주소 생략]').trim().slice(0, 500) || undefined;
}
async function toss(path: string, body: object, idempotencyKey: string) {
  const response = await fetch(`https://api.tosspayments.com/v1/payments${path}`, {
    method: 'POST', redirect: 'error', signal: AbortSignal.timeout(45000),
    headers: { Authorization: `Basic ${Buffer.from(`${secretKey}:`).toString('base64')}`,
      'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey },
    body: JSON.stringify(body),
  });
  const data = await response.json();
  return { ok: response.ok, status: response.status, data };
}
async function confirm(o: Order, body: { orderId: string; amount: number; paymentKey: string }) {
  if (!validatePaymentApprovalRequest(o.state, body)) return { status: 400, body: { error: 'INVALID_ORDER_AMOUNT' } };
  if (typeof body.paymentKey !== 'string' || !/^[A-Za-z0-9_-]{1,200}$/.test(body.paymentKey))
    return { status: 400, body: { error: 'INVALID_PAYMENT_KEY' } };
  if (o.paymentKey && o.paymentKey !== body.paymentKey) return { status: 409, body: { error: 'PAYMENT_KEY_CONFLICT' } };
  if (o.stage !== 'pending') return { status: 200, body: publicOrder(o) };
  o.stage = 'approving'; o.paymentKey = body.paymentKey; persist();
  try {
    const result = await toss('/confirm', { orderId: o.id, amount: o.state.amountKrw, paymentKey: body.paymentKey }, `confirm_${o.id}`);
    if (!result.ok) {
      o.stage = result.status >= 500 ? 'review' : 'failed'; o.code = safeCode(result.data?.code);
      o.message = safeMessage(result.data?.message); persist();
      return { status: 200, body: publicOrder(o) };
    }
    const raw = result.data;
    if (raw.paymentKey !== body.paymentKey || raw.orderId !== o.id || raw.totalAmount !== o.state.amountKrw
      || raw.currency !== 'KRW' || raw.method !== '카드' || raw.status !== 'DONE'
      || typeof raw.approvedAt !== 'string') {
      o.stage = 'review'; o.code = 'UNEXPECTED_PAYMENT_RESPONSE'; persist();
      return { status: 200, body: publicOrder(o) };
    }
    const payment: Payment = { paymentKey: raw.paymentKey, orderId: raw.orderId, totalAmount: raw.totalAmount,
      currency: raw.currency, method: raw.method, status: raw.status, approvedAt: raw.approvedAt };
    const reduced = reduceVerifiedPaymentApproval(o.state, payment, Date.now());
    o.state = reduced.state; o.providerStatus = payment.status;
    if (reduced.effects.some(e => e.type === 'confirm-reservation')) { o.stage = 'confirmed'; persist(); }
    else if (reduced.effects.some(e => e.type === 'request-refund')) {
      o.stage = 'refund-pending'; persist();
      const canceled = await toss(`/${encodeURIComponent(body.paymentKey)}/cancel`, {
        cancelReason: '시연 예약 점유 만료 또는 자리 확보 실패', cancelAmount: o.state.amountKrw,
      }, `refund_${o.id}`);
      const refunded = canceled.ok && canceled.data.paymentKey === body.paymentKey && canceled.data.orderId === o.id
        && canceled.data.status === 'CANCELED' && canceled.data.totalAmount === o.state.amountKrw
        && canceled.data.balanceAmount === 0 && Array.isArray(canceled.data.cancels)
        && canceled.data.cancels.some((c: { cancelStatus: string; cancelAmount: number }) =>
          c.cancelStatus === 'DONE' && c.cancelAmount === o.state.amountKrw);
      if (refunded) { o.stage = 'refunded'; o.state = { ...o.state, refundedAmountKrw: o.state.amountKrw }; }
      else {
        o.stage = 'review'; o.code = canceled.ok ? 'UNEXPECTED_REFUND_RESPONSE' : safeCode(canceled.data?.code);
        o.message = canceled.ok ? undefined : safeMessage(canceled.data?.message);
      }
      persist();
    } else { o.stage = 'review'; o.code = 'UNEXPECTED_RULE_RESULT'; persist(); }
  } catch {
    o.stage = 'review'; o.code = 'REQUEST_OUTCOME_UNKNOWN'; persist();
  }
  return { status: 200, body: publicOrder(o) };
}
const locks = new Map<string, Promise<unknown>>();
const assets = new Map([['/', ['index.html', 'text/html']], ['/success', ['index.html', 'text/html']],
  ['/fail', ['index.html', 'text/html']], ['/result', ['index.html', 'text/html']],
  ['/app.js', ['app.js', 'text/javascript']], ['/style.css', ['style.css', 'text/css']]]);
createServer(async (req, res) => {
  res.setHeader('Cache-Control', 'no-store'); res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Content-Type-Options', 'nosniff'); res.setHeader('X-Frame-Options', 'DENY');
  const json = (status: number, body: unknown) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(body)); };
  try {
    if (req.headers.host !== 'localhost:5180' && req.headers.host !== '127.0.0.1:5180') return json(403, { error: 'LOCAL_HOST_REQUIRED' });
    const url = new URL(req.url ?? '/', origin);
    const owner = driver.id;
    if (req.method === 'POST') {
      if (req.headers.origin !== origin && req.headers.origin !== 'http://127.0.0.1:5180') return json(403, { error: 'ORIGIN_REJECTED' });
      if (!req.headers['content-type']?.startsWith('application/json')) return json(415, { error: 'JSON_REQUIRED' });
    }
    if (req.method === 'GET' && url.pathname === '/api/config') return json(200, { clientKey, station: station.statNm });
    if (req.method === 'GET' && url.pathname === '/api/order') {
      const o = orders.find(o => o.id === url.searchParams.get('orderId') && o.owner === owner);
      return o ? json(200, publicOrder(o)) : json(404, { error: 'ORDER_NOT_FOUND' });
    }
    if (req.method === 'POST' && url.pathname === '/api/order') {
      // 단일 운전자 시연. 확정 이후 두 번째 진행 중 예약을 만들지 않는다.
      const active = orders.find(o => o.stage === 'confirmed' || o.stage === 'review' || o.stage === 'approving'
        || o.stage === 'refund-pending' || (o.stage === 'pending' && Date.now() < o.state.expiresAtMs));
      if (active) return active.owner === owner ? json(200, publicOrder(active)) : json(409, { error: 'DEMO_ORDER_IN_USE' });
      const now = Date.now(); const id = `ev_${randomUUID()}`;
      const o: Order = { id, owner, customerKey: randomUUID(), station, ...demoReservationRange(now), createdAtMs: now,
        stage: 'pending', state: { orderId: id, amountKrw: 3000, currency: 'KRW', expiresAtMs: now + 600000,
          slotAvailable: true, processedPaymentKeys: [], reservationCount: 0, chargedAmountKrw: 0,
          refundRequestedAmountKrw: 0, refundedAmountKrw: 0 } };
      orders.push(o); persist(); return json(200, publicOrder(o));
    }
    if (req.method === 'POST' && url.pathname === '/api/confirm') {
      let text = ''; for await (const chunk of req) { text += chunk; if (text.length > 8192) return json(413, { error: 'BODY_TOO_LARGE' }); }
      const body = JSON.parse(text);
      const o = orders.find(o => o.id === body.orderId && o.owner === owner);
      if (!o) return json(404, { error: 'ORDER_NOT_FOUND' });
      if (locks.has(o.id)) await locks.get(o.id);
      const work = confirm(o, body); locks.set(o.id, work);
      try { const result = await work; json(result.status, result.body); } finally { if (locks.get(o.id) === work) locks.delete(o.id); }
      return;
    }
    const asset = assets.get(url.pathname);
    if (req.method === 'GET' && asset) {
      res.writeHead(200, { 'Content-Type': `${asset[1]}; charset=utf-8` });
      res.end(readFileSync(new URL(`public/${asset[0]}`, import.meta.url))); return;
    }
    json(404, { error: 'NOT_FOUND' });
  } catch { if (!res.headersSent) json(500, { error: 'LOCAL_SERVER_ERROR' }); else res.end(); }
}).listen(5180, '127.0.0.1', () => console.log(`토스 테스트 결제 시연: ${origin}`));
