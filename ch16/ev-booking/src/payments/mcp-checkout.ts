import { readFile } from 'node:fs/promises';
import type { BookingDependencies, Hold } from '../mcp/booking-server.js';
import { loadBookingChargers } from '../mcp/booking-server.js';
import { readCheckoutSnapshot } from '../mcp/checkout-storage.js';
import type { CheckoutSnapshot } from '../mcp/checkout-storage.js';
import { approvalPath } from '../mcp/approval-path.js';
import { holdIsValid } from '../rules/booking.js';

export interface CheckoutOptions {
  projectDirectory: string;
  dataDirectory: string;
  sharedFile: string;
  now?(): number;
  approvalFiles: BookingDependencies['approvalFiles'];
  clientKey: string;
  csrf?: string;
}

export interface CheckoutOrder {
  orderId: string; holdId: string; amount: number; mode: 'test';
  hold: Hold; stationName: string;
}
export function escapeHtml(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;',
    '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}
export function checkoutPage(title: string, content: string, script = ''): string {
  return `<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${escapeHtml(title)} · EV Booking</title><style>
  *{box-sizing:border-box}body{margin:0;background:#f3f6fa;color:#182537;font:16px/1.65 system-ui,sans-serif}
  main{max-width:660px;margin:40px auto;padding:28px;background:white;border-radius:20px}
  h1{font-size:26px}.badge{color:#087b60;font-weight:700}dt{color:#64748b}dd{margin:0 0 14px;font-weight:600;overflow-wrap:anywhere}
  button{width:100%;padding:15px;border:0;border-radius:12px;background:#1769e8;color:white;font:inherit;cursor:pointer}
  button:disabled{background:#9ba9bb}.note{color:#526175;font-size:14px}.error{color:#b42318;overflow-wrap:anywhere}
  @media(max-width:700px){main{margin:16px;padding:22px}}</style><main><span class="badge">EV BOOKING · 테스트 모드</span>
  <h1>${escapeHtml(title)}</h1>${content}<hr><p class="note">학습용 가상 예약입니다. 실제 충전소 이용·주차면·충전량을 보장하지 않습니다. 실제 금전은 청구되지 않습니다.</p></main>${script}</html>`;
}
const seoul = (ms: number) => new Intl.DateTimeFormat('ko-KR', {
  timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', hour12: false,
}).format(ms);
export function checkoutSummary(order: CheckoutOrder): string {
  return `<dl><dt>충전소</dt><dd>${escapeHtml(order.stationName)}</dd>
  <dt>충전기</dt><dd>${escapeHtml(order.hold.statId)} / ${escapeHtml(order.hold.chgerId)}</dd>
  <dt>예약 시간 (서울)</dt><dd>${seoul(order.hold.startMs)} ~ ${seoul(order.hold.endMs)}</dd>
  <dt>예약금</dt><dd>3,000원</dd><dt>주문번호</dt><dd>${escapeHtml(order.orderId)}</dd>
  <dt>임시 점유 기한 (서울)</dt><dd>${seoul(order.hold.expiresMs)}</dd></dl>`;
}
const reasons: Record<string, string> = {
  ORDER_UNAVAILABLE: '주문을 찾을 수 없습니다. MCP에서 새 결제 링크를 요청해 주세요.',
  DATA_UNAVAILABLE: '주문 또는 점유 정보를 읽을 수 없습니다. MCP 연결과 공유 파일을 확인해 주세요.',
  APPROVAL_REQUIRED: '이 점유에 대한 사람 승인이 없습니다. 사람이 터미널에서 승인한 뒤 다시 열어 주세요.',
  HOLD_EXPIRED: '임시 점유가 만료되었습니다. 새 점유와 사람 승인 후 결제 링크를 요청해 주세요.',
};
export function checkoutReason(code: string): string { return reasons[code] ?? '결제를 진행할 수 없습니다.'; }

export function createMcpCheckout(options: CheckoutOptions) {
  function now(snapshot: CheckoutSnapshot): number {
    return options.now ? options.now() : snapshot.clock.policyMs + Math.max(0, Date.now() - snapshot.clock.realMs);
  }
  async function lookup(orderId: string) {
    const snapshot = await readCheckoutSnapshot(options.sharedFile);
    const row = snapshot.orders.find(o => o.orderId === orderId);
    if (!row) return { snapshot, order: undefined };
    const hold = snapshot.holds.find(h => h.id === row.holdId && h.userId === row.userId)!;
    const stations = await loadBookingChargers({ dataDirectory: options.dataDirectory,
      readJson: async path => JSON.parse(await readFile(path, 'utf8')) as unknown });
    const station = stations.find(s => s.statId === hold.statId && s.chgerId === hold.chgerId);
    if (!station || typeof station.statNm !== 'string') throw new Error('STATION_UNAVAILABLE');
    const order: CheckoutOrder = { orderId: row.orderId, holdId: hold.id,
      amount: row.amount, mode: row.mode, hold: { ...hold }, stationName: station.statNm };
    return { snapshot, order };
  }
  async function evaluate(orderId: string) {
    try {
      const { snapshot, order } = await lookup(orderId);
      if (!order) return { ok: false, code: 'ORDER_UNAVAILABLE' };
      if (!holdIsValid(order.hold, now(snapshot))) return { ok: false, code: 'HOLD_EXPIRED' };
      const approved = await options.approvalFiles.exists(approvalPath(options.projectDirectory, order.holdId));
      // Recheck after async approval and file reads, including a possible MCP restart.
      const latest = await lookup(orderId);
      if (!latest.order || latest.snapshot.sessionId !== snapshot.sessionId) return { ok: false, code: 'ORDER_UNAVAILABLE' };
      if (!holdIsValid(latest.order.hold, now(latest.snapshot))) return { ok: false, code: 'HOLD_EXPIRED' };
      if (!approved) return { ok: false, code: 'APPROVAL_REQUIRED' };
      return { ok: true, code: 'READY', order: latest.order };
    } catch { return { ok: false, code: 'DATA_UNAVAILABLE' }; }
  }
  return {
    async getOrder(orderId: string): Promise<CheckoutOrder | undefined> {
      try { return (await lookup(orderId)).order; } catch { return undefined; }
    },
    async policyNow(): Promise<number> { return now(await readCheckoutSnapshot(options.sharedFile)); },
    async preparePayment(orderId: string) { return evaluate(orderId); },
    async renderCheckout(orderId: string) {
      const result = await evaluate(orderId);
      if (!result.ok || !result.order) return { code: result.code,
        html: checkoutPage('결제를 진행할 수 없습니다', `<p class="error">${checkoutReason(result.code)}</p>`) };
      const config = JSON.stringify({ clientKey: options.clientKey, orderId, csrf: options.csrf ?? '',
        origin: 'http://127.0.0.1:5180', orderName: '가상 충전소 예약금' }).replace(/</g, '\\u003c');
      return { code: 'READY', html: checkoutPage('예약금 테스트 결제', checkoutSummary(result.order)
        + '<p class="note">카드만 지원합니다. 시작 120분 전까지 3,000원, 30~120분 전은 1,500원, 30분 미만·시작 후 및 노쇼는 0원 환불입니다. 충전비·주차비는 청구하지 않습니다.</p>'
        + '<div id="payment-method"></div><div id="agreement"></div><p id="message" role="status">결제 위젯을 불러오는 중입니다.</p><button id="pay" disabled>3,000원 테스트 결제</button>',
        `<script src="https://js.tosspayments.com/v2/standard"></script><script>
        const config=${config};const button=document.getElementById('pay');const message=document.getElementById('message');
        function failure(reason){message.className='error';message.textContent=reason;}
        (async()=>{try{const tossPayments=TossPayments(config.clientKey);
          const widgets=tossPayments.widgets({customerKey:TossPayments.ANONYMOUS});
          await widgets.setAmount({currency:'KRW',value:3000});
          const methods=await widgets.renderPaymentMethods({selector:'#payment-method',variantKey:'DEFAULT'});
          await widgets.renderAgreement({selector:'#agreement',variantKey:'AGREEMENT'});
          message.textContent='카드를 선택하고 테스트 결제를 진행해 주세요.';button.disabled=false;
          button.onclick=async()=>{button.disabled=true;let blocked=false;try{
            const selected=await methods.getSelectedPaymentMethod();if(selected.code!=='CARD')throw new Error('CARD_ONLY');
            const response=await fetch('/api/payment-ready',{method:'POST',headers:{'Content-Type':'application/json','X-Demo-CSRF':config.csrf},body:JSON.stringify({orderId:config.orderId})});
            const ready=await response.json();if(!response.ok||!ready.ok){blocked=true;failure(ready.message||'점유 또는 승인이 유효하지 않습니다.');return;}
            await widgets.requestPayment({orderId:config.orderId,orderName:config.orderName,successUrl:config.origin+'/success',failUrl:config.origin+'/fail',windowTarget:'self'});
          }catch(e){failure(e.message==='CARD_ONLY'?'이 시연은 카드 결제만 지원합니다.':e.code==='USER_CANCEL'?'결제창을 닫았습니다. 예약은 미확정입니다.':'결제 요청을 완료하지 못했습니다.');}
          finally{button.disabled=blocked;}};
        }catch{failure('결제 위젯을 불러오지 못했습니다.');}})();</script>`) };
    },
  };
}
