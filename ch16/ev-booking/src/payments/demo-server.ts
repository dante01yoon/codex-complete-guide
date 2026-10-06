import { createServer } from 'node:http';
import type { ServerResponse, IncomingMessage } from 'node:http';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { parseEnv } from 'node:util';
import { confirmPayment } from './confirm.js';
import type { Dependencies, Order, Payment } from './confirm.js';
import { chargerEligible, slotTimeAllowed, HOLD_DURATION_MS } from '../rules/booking.js';
import { hasReservationOverlap } from '../rules/overlap.js';
import type { Occupancy } from '../rules/types.js';

const ORIGIN = 'http://127.0.0.1:5180';
const env = parseEnv(await readFile(new URL('../../.env', import.meta.url), 'utf8'));
if (!/^test_gck_[^\s:]+$/.test(env.TOSS_CLIENT_KEY ?? '') ||
    !/^test_(?:gsk|sk)_[^\s:]+$/.test(env.TOSS_SECRET_KEY ?? '')) {
  throw new Error('위젯용 TOSS_CLIENT_KEY와 TOSS_SECRET_KEY 테스트 키를 .env에 준비하세요.');
}
const authorization = `Basic ${Buffer.from(`${env.TOSS_SECRET_KEY}:`).toString('base64')}`;
const policyAnchor = Date.now();
const monotonicStart = performance.now();
const policyNow = () => policyAnchor + Math.floor(performance.now() - monotonicStart);
const orderId = process.env.BOOKING_DEMO_ORDER_ID ?? `demo-${randomUUID()}`;
if (!/^demo-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(orderId)) {
  throw new Error('BOOKING_DEMO_ORDER_ID는 demo-UUID 형식이어야 합니다.');
}
const csrf = randomUUID();
const charger = { statId: 'DEMO', chgerId: '01', limitYn: 'N', delYn: 'N',
  useTime: '24시간 이용가능', stat: '2', chgerType: '04' };
const stationName = '서울 충전소 (가상 시연 데이터)';
let startMs = 0;
let endMs = 0;
const orders = new Map<string, Order>();
const payments = new Map<string, Payment>();
const reservations: Occupancy[] = [];
let queue: Promise<unknown> = Promise.resolve();
let providerReason = '';

// Never send raw SDK/API errors, credentials, or payment keys to the UI/log.
function clean(value: unknown): string {
  return String(value ?? '').slice(0, 400)
    .replace(/(?:test|live)_(?:g?sk|g?ck)_[^\s<"'&]+/g, '[키 숨김]');
}
function escape(value: unknown): string {
  return clean(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;',
    '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}
async function toss(path: string, body?: unknown, idempotencyKey?: string): Promise<Payment & {
  cancels?: { cancelAmount: number; cancelStatus: string }[];
}> {
  let response: Response;
  try {
    response = await fetch(`https://api.tosspayments.com/v1/payments${path}`, {
      method: body === undefined ? 'GET' : 'POST', redirect: 'error',
      headers: { Authorization: authorization, 'Content-Type': 'application/json',
        ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    providerReason = '토스 테스트 서버에 연결하지 못했습니다.';
    throw new Error('TOSS_CONNECTION_FAILED');
  }
  const result = await response.json() as Record<string, unknown>;
  if (!response.ok) {
    // Display a provider code only: raw messages may contain request secrets.
    const code = typeof result.code === 'string' && /^[A-Z0-9_]{1,100}$/.test(result.code)
      ? result.code : 'TOSS_API_ERROR';
    providerReason = `토스 테스트 요청 거절: ${code} (HTTP ${response.status})`;
    throw new Error('TOSS_REQUEST_FAILED');
  }
  return result as unknown as Payment & { cancels?: { cancelAmount: number; cancelStatus: string }[] };
}
const dependencies: Dependencies = {
  policyNow, realNow: Date.now,
  toss: {
    async confirm(input, key) {
      providerReason = '';
      const payment = await toss('/confirm', {
        paymentKey: input.paymentKey, orderId: input.orderId, amount: input.amount,
      }, key);
      payments.set(payment.paymentKey, payment);
      return payment;
    },
    getPayment: key => toss(`/${encodeURIComponent(key)}`),
    async refund(key, amount, idempotencyKey) {
      const payment = await toss(`/${encodeURIComponent(key)}/cancel`, {
        cancelReason: '가상 예약 점유 만료 또는 자리 확보 실패', cancelAmount: amount,
      }, idempotencyKey);
      payments.set(key, payment);
      const refundedAmount = (payment.cancels ?? [])
        .filter(cancel => cancel.cancelStatus === 'DONE')
        .reduce((sum, cancel) => sum + cancel.cancelAmount, 0);
      return { refundedAmount };
    },
  },
  repository: {
    async getOrder(id) { return orders.get(id); },
    async saveOrder(order) { orders.set(order.orderId, order); },
    async recordPayment() { /* Verified provider details are cached above. */ },
    async insertReservation() {
      reservations.push({ charger, range: { startMs, endMs }, kind: 'confirmed' });
    },
    transaction<T>(work: () => Promise<T>): Promise<T> {
      const result = queue.then(work);
      queue = result.then(() => undefined, () => undefined);
      return result;
    },
  },
  async canReserve(order) {
    return chargerEligible(charger, 'DC콤보', false)
      && ![...orders.values()].some(other => other.orderId !== order.orderId && other.confirmed)
      && !hasReservationOverlap(charger, { startMs, endMs }, reservations);
  },
};

function page(title: string, content: string, script = ''): string {
  return `<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${escape(title)} · EV Booking</title><style>
  *{box-sizing:border-box}body{margin:0;background:#f3f6fa;color:#182537;font:16px/1.65 system-ui,sans-serif}
  main{max-width:660px;margin:40px auto;padding:28px;background:white;border-radius:20px;box-shadow:0 12px 35px #152b4510}
  h1{font-size:26px;margin:12px 0}h2{font-size:20px}.badge{color:#087b60;font-weight:700}dt{color:#64748b}dd{margin:0 0 14px;font-weight:600;overflow-wrap:anywhere}
  button,a.button{display:block;width:100%;padding:15px;border:0;border-radius:12px;background:#1769e8;color:white;font:inherit;font-weight:700;text-align:center;text-decoration:none;cursor:pointer}
  button:disabled{background:#9ba9bb;cursor:wait}.note{color:#526175;font-size:14px}.error{color:#b42318;white-space:pre-wrap;overflow-wrap:anywhere}hr{border:0;border-top:1px solid #e3e8ef;margin:24px 0}
  @media(max-width:700px){main{margin:16px;padding:22px}} </style>
  <main><span class="badge">EV BOOKING · 테스트 모드</span><h1>${escape(title)}</h1>${content}
  <hr><p class="note">학습용 가상 예약입니다. 실제 충전소 이용·주차면·충전량을 보장하지 않습니다. 실제 금전은 청구되지 않습니다.<br>주문은 서버 메모리에만 저장되며 서버 종료 시 사라집니다.</p></main>${script}</html>`;
}
const seoul = (ms: number) => new Intl.DateTimeFormat('ko-KR', {
  timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', hour12: false,
}).format(ms);
function summary(order: Order): string {
  return `<dl><dt>충전소</dt><dd>${escape(stationName)}</dd><dt>예약 시간 (서울)</dt><dd>${escape(seoul(startMs))} ~ ${escape(seoul(endMs))}</dd>
  <dt>예약금</dt><dd>3,000원</dd><dt>주문번호</dt><dd>${escape(order.orderId)}</dd>
  <dt>임시 점유 기한 (서울)</dt><dd>${escape(seoul(order.holdExpiresAt))}</dd></dl>`;
}
function send(res: ServerResponse, status: number, body: string, json = false) {
  res.writeHead(status, { 'Content-Type': json ? 'application/json; charset=utf-8' : 'text/html; charset=utf-8',
    'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY' });
  res.end(body);
}
function owner(req: IncomingMessage, order: Order): boolean {
  return req.headers.cookie?.split(';').some(c => c.trim() === `ev_demo=${order.userId}`) ?? false;
}
async function handle(req: IncomingMessage, res: ServerResponse) {
  if (req.headers.host !== '127.0.0.1:5180') {
    send(res, 403, page('접근 거절', '<p>127.0.0.1:5180에서 열어 주세요.</p>')); return;
  }
  const url = new URL(req.url ?? '/', ORIGIN);
  if (req.method === 'GET' && url.pathname === '/') {
    res.writeHead(303, { Location: `/checkout/${orderId}`, 'Cache-Control': 'no-store' }); res.end(); return;
  }
  if (req.method === 'GET' && url.pathname === `/checkout/${orderId}`) {
    if (!orders.has(orderId)) {
      const now = policyNow();
      startMs = Math.ceil((now + 2 * 60 * 60_000) / (30 * 60_000)) * 30 * 60_000;
      endMs = startMs + 60 * 60_000;
      if (!slotTimeAllowed(startMs, 60, now)) throw new Error('DEMO_SLOT_INVALID');
      const userId = randomUUID();
      orders.set(orderId, { orderId, userId, amount: 3000, holdExpiresAt: now + HOLD_DURATION_MS,
        confirmed: false, refundAttempts: 0, refundedAmount: 0, operatorReviewRequired: false });
    }
    const order = orders.get(orderId)!;
    // One synthetic demo account, not a login or MCP approval mechanism.
    res.setHeader('Set-Cookie', `ev_demo=${order.userId}; HttpOnly; SameSite=Lax; Path=/`);
    if (order.confirmed || policyNow() >= order.holdExpiresAt) {
      send(res, 200, page(order.confirmed ? '예약 확정' : '임시 점유 만료', summary(order)
        + '<p>새 시연은 서버를 다시 시작해 주세요.</p>')); return;
    }
    const config = JSON.stringify({ clientKey: env.TOSS_CLIENT_KEY, orderId, csrf,
      orderName: '가상 충전소 예약금', origin: ORIGIN }).replace(/</g, '\\u003c');
    send(res, 200, page('예약금 테스트 결제', summary(order)
      + '<p class="note">카드만 사용해 주세요. 시작 120분 전까지 취소 시 3,000원, 30~120분 전은 1,500원, 30분 미만·시작 후 및 노쇼는 0원 환불입니다. 충전비·주차비는 청구하지 않습니다.</p><div id="payment-method"></div><div id="agreement"></div><p id="message" role="status">결제 위젯을 불러오는 중입니다.</p><button id="pay" disabled>3,000원 테스트 결제</button>',
      `<script src="https://js.tosspayments.com/v2/standard"></script><script>
      const config=${config};const button=document.getElementById('pay');const message=document.getElementById('message');
      function failure(reason){message.className='error';message.textContent=reason;}
      (async()=>{try{
        const tossPayments=TossPayments(config.clientKey);const widgets=tossPayments.widgets({customerKey:TossPayments.ANONYMOUS});
        await widgets.setAmount({currency:'KRW',value:3000});
        const methods=await widgets.renderPaymentMethods({selector:'#payment-method',variantKey:'DEFAULT'});
        await widgets.renderAgreement({selector:'#agreement',variantKey:'AGREEMENT'});
        message.textContent='카드를 선택하고 테스트 결제를 진행해 주세요.';button.disabled=false;
        button.onclick=async()=>{button.disabled=true;try{
          const selected=await methods.getSelectedPaymentMethod();if(selected.code!=='CARD'){throw new Error('CARD_ONLY');}
          await widgets.requestPayment({orderId:config.orderId,orderName:config.orderName,
            successUrl:config.origin+'/success',failUrl:config.origin+'/fail',windowTarget:'self'});
        }catch(e){failure(e.code==='USER_CANCEL'?'결제창을 닫았습니다. 예약은 확정되지 않았습니다.':e.message==='CARD_ONLY'?'이 시연은 카드 결제만 지원합니다.':'결제 요청 실패: '+(e.code||'SDK_ERROR'));button.disabled=false;}};
      }catch(e){failure('결제 위젯을 불러오지 못했습니다: '+(e.code||'SDK_LOAD_FAILED'));}})();</script>`)); return;
  }
  const order = orders.get(url.searchParams.get('orderId') ?? '');
  if (req.method === 'GET' && url.pathname === '/success') {
    if (!order || !owner(req, order)) {
      send(res, 400, page('예약 미확정', '<p>주문 또는 시연 세션이 유효하지 않습니다. 서버 재시작 시 주문은 사라집니다.</p>')); return;
    }
    if (!url.searchParams.has('paymentKey')) {
      const payment = order.paymentKey ? payments.get(order.paymentKey) : undefined;
      send(res, 200, page('테스트 결제 결과', summary(order) + `<dl>
        <dt>예약 확정 여부</dt><dd>${order.confirmed ? '확정' : '미확정'}</dd>
        <dt>결제 금액</dt><dd>${payment ? escape(payment.totalAmount) + '원' : '승인 확인 없음'}</dd>
        <dt>결제 수단</dt><dd>${escape(payment?.method ?? '승인 확인 없음')}</dd>
        <dt>환불 금액</dt><dd>${order.refundedAmount}원</dd></dl>`)); return;
    }
    send(res, 200, page('테스트 결제 결과', summary(order)
      + '<p id="result" role="status">토스 테스트 서버의 승인을 확인하고 있습니다. 아직 예약은 미확정입니다.</p><dl id="details"></dl>',
      `<script>(async()=>{const result=document.getElementById('result');try{
      const q=new URLSearchParams(location.search);const response=await fetch('/api/confirm',{method:'POST',headers:{'Content-Type':'application/json','X-Demo-CSRF':${JSON.stringify(csrf)}},body:JSON.stringify({orderId:q.get('orderId'),paymentKey:q.get('paymentKey'),amount:q.get('amount')})});
      const data=await response.json();history.replaceState(null,'','/success?orderId='+encodeURIComponent(q.get('orderId')));
      result.textContent=data.message;for(const [label,value] of [['예약 확정 여부',data.confirmed?'확정':'미확정'],['결제 금액',data.amount===undefined?'승인 확인 없음':data.amount.toLocaleString('ko-KR')+'원'],['결제 수단',data.method||'승인 확인 없음'],['토스 상태',data.paymentStatus||'확인 없음'],['환불 금액',(data.refundedAmount||0).toLocaleString('ko-KR')+'원']]){const dt=document.createElement('dt');dt.textContent=label;const dd=document.createElement('dd');dd.textContent=value;document.getElementById('details').append(dt,dd);}
      }catch{result.className='error';result.textContent='승인 결과를 확인하지 못했습니다. 예약 확정으로 판단하지 마세요.';}})();</script>`)); return;
  }
  if (req.method === 'POST' && url.pathname === '/api/confirm') {
    if (req.headers.origin !== ORIGIN || req.headers['x-demo-csrf'] !== csrf ||
        !req.headers['content-type']?.startsWith('application/json')) {
      send(res, 403, JSON.stringify({ message: '시연 세션 요청이 유효하지 않습니다.', confirmed: false }), true); return;
    }
    let body = '';
    for await (const chunk of req) { body += chunk; if (Buffer.byteLength(body) > 4096) {
      send(res, 413, JSON.stringify({ message: '요청이 너무 큽니다.', confirmed: false }), true); return;
    } }
    let input: Record<string, unknown>;
    try {
      input = JSON.parse(body);
      if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('INVALID_BODY');
    } catch {
      send(res, 400, JSON.stringify({ message: '요청 형식 오류', confirmed: false }), true); return;
    }
    const found = typeof input.orderId === 'string' ? orders.get(input.orderId) : undefined;
    if (!found || !owner(req, found)) {
      send(res, 403, JSON.stringify({ message: '주문 또는 시연 세션이 유효하지 않습니다.', confirmed: false }), true); return;
    }
    const amount = typeof input.amount === 'string' && /^\d+$/.test(input.amount)
      ? Number(input.amount) : input.amount;
    const result = await confirmPayment({ orderId: found.orderId, userId: found.userId,
      paymentKey: typeof input.paymentKey === 'string' ? input.paymentKey : '',
      amount: typeof amount === 'number' ? amount : NaN }, dependencies);
    const payment = found.paymentKey ? payments.get(found.paymentKey) : undefined;
    const messages = { confirmed: '테스트 결제 승인 완료 · 가상 예약이 확정되었습니다.',
      rejected: '금액 또는 결제 정보가 일치하지 않아 거절했습니다. 예약은 미확정입니다.',
      unconfirmed: providerReason || '카드 DONE 승인을 확인하지 못했습니다. 예약은 미확정입니다.',
      refunded: '자리 확보 실패 또는 점유 만료로 예약은 미확정이며 3,000원을 전액 환불했습니다.',
      operator_review_required: '예약은 미확정입니다. 환불 실패로 운영자 확인이 필요합니다.' };
    send(res, result.status === 'rejected' ? 400 : 200, JSON.stringify({
      status: result.status, message: messages[result.status], confirmed: found.confirmed,
      ...(payment ? { amount: payment.totalAmount, method: payment.method, paymentStatus: payment.status } : {}),
      refundedAmount: found.refundedAmount,
    }), true); return;
  }
  if (req.method === 'GET' && url.pathname === '/fail') {
    send(res, 200, page('테스트 결제 실패', '<p>예약은 확정되지 않았습니다.</p><p class="error">'
      + escape(url.searchParams.get('code') ?? 'PAYMENT_FAILED') + '<br>'
      + escape(url.searchParams.get('message') ?? '결제를 완료하지 못했습니다.') + '</p>')); return;
  }
  send(res, 404, page('주문을 찾을 수 없습니다', '<p>알 수 없는 주문입니다. 서버 재시작 시 이전 주문은 사라집니다.</p>'));
}
createServer((req, res) => {
  void handle(req, res).catch(() => {
    if (!res.headersSent) send(res, 500, page('시연 서버 오류', '<p>결과를 확인할 수 없습니다. 예약 확정으로 판단하지 마세요.</p>'));
    else res.end();
  });
}).listen(5180, '127.0.0.1', () => {
  console.log(`결제 시연: ${ORIGIN}/checkout/${orderId}`);
  console.log('메모리 주문·가상 충전소·토스 테스트 모드. 종료: Ctrl+C');
});
