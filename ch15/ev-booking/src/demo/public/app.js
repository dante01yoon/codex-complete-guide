const $ = id => document.getElementById(id);
const format = (ms, options) => new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', ...options }).format(ms);
const money = value => `${value.toLocaleString('ko-KR')}원`;
let order;
let widgets;
let methods;
let timer;
function status(message, error = false) { $('status').textContent = message; $('status').classList.toggle('error', error); }
function safeFailureCode(value) {
  return typeof value === 'string' && /^[A-Z][A-Z0-9_]{0,127}$/.test(value) ? value : null;
}
function safeFailureMessage(value) {
  if (typeof value !== 'string') return null;
  const message = value
    .replace(/[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/g, ' ')
    .replace(/(?:test|live)_(?:gck|gsk|ck|sk)_[A-Za-z0-9_-]+/g, '[키 숨김]')
    .replace(/\b(?:Basic|Bearer)\s+[A-Za-z0-9+/=_-]+/gi, '[인증 정보 숨김]')
    .replace(/(?:paymentKey|authKey|clientKey|secretKey|token)\s*[=:]\s*[^\s,;]+/gi, '[식별 정보 숨김]')
    .replace(/https?:\/\/[^\s<>]+/gi, '[주소 생략]')
    .trim().slice(0, 500);
  return message || null;
}
function appendDetail(dl, label, value) {
  const row = document.createElement('div'); const dt = document.createElement('dt'); const dd = document.createElement('dd');
  dt.textContent = label; dd.textContent = value; row.append(dt, dd); dl.append(row);
}
function showFailureDetails(code, message) {
  $('result').replaceChildren(); $('result').hidden = false;
  const title = document.createElement('h3'); title.textContent = '결제 인증 실패 안내';
  const dl = document.createElement('dl');
  appendDetail(dl, '실패 코드', safeFailureCode(code) || '확인할 실패 코드가 없습니다.');
  appendDetail(dl, '실패 사유', safeFailureMessage(message) || '확인할 실패 사유가 없습니다.');
  const note = document.createElement('p'); note.className = 'small';
  note.textContent = '결제창에서 전달받은 안내입니다. 서버의 결제 승인 결과와는 구분됩니다.';
  $('result').append(title, dl, note);
}
async function api(path, body) {
  const res = await fetch(path, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {});
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'LOCAL_SERVER_ERROR');
  return data;
}
function summary(o) {
  $('order-heading').textContent = o.station.name; $('address').textContent = o.station.address;
  $('charger').textContent = `${o.station.connector} · ${o.station.output || '출력 정보 없음'}${o.station.output ? ' kW' : ''} · 충전기 ${o.station.chargerId}`;
  $('date').textContent = format(o.startMs, { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' });
  $('time').textContent = `${format(o.startMs, { hour: '2-digit', minute: '2-digit', hour12: false })} – ${format(o.endMs, { hour: '2-digit', minute: '2-digit', hour12: false })}`;
}
function result(o) {
  clearInterval(timer); $('heading').textContent = '결제 결과'; $('lead').textContent = '서버에서 확인한 승인 및 예약 처리 결과입니다.';
  $('payment-heading').textContent = '처리 결과'; $('payment-method').hidden = true; $('agreement').hidden = true;
  $('pay').hidden = true; $('back').hidden = false; $('deadline').textContent = '';
  const messages = {
    confirmed: ['시연 예약이 확정되었습니다', '토스 카드 결제 승인을 확인하고 기존 승인 규칙으로 처리했습니다.'],
    refunded: ['예약금 전액 환불 완료', '임시 점유 기한이 지나 예약을 확정하지 않았습니다. 토스에서 3,000원 취소 완료를 확인했습니다.'],
    review: ['운영자 확인 필요', '승인 또는 환불 결과를 확정할 수 없습니다. 같은 요청을 자동으로 다시 보내지 않습니다.'],
    failed: ['결제 승인이 실패했습니다', '결제 완료 또는 예약 확정으로 처리하지 않았습니다.'],
    pending: ['결제 완료가 확인되지 않았습니다', '승인 전 상태입니다. 결제창 진입만으로 예약이 확정되지 않습니다.'],
    approving: ['승인 확인 중', '외부 응답을 기다리고 있습니다.'],
    'refund-pending': ['환불 확인 중', '아직 환불 완료가 아닙니다.'],
  };
  const [title, detail] = messages[o.stage] || messages.review;
  $('result').replaceChildren(); $('result').hidden = false;
  const heading = document.createElement('h3'); heading.textContent = title;
  const p = document.createElement('p'); p.textContent = detail;
  const dl = document.createElement('dl');
  for (const [label, value] of [['주문번호', o.orderId], ['토스 결제 상태', o.providerStatus || '완료 확인 없음'],
    ['시연 예약', `${o.reservationCount}건`], ['승인 반영 금액', money(o.chargedAmount)],
    ['환불 완료 금액', money(o.refundedAmount)], ...(o.code ? [['확인 코드', safeFailureCode(o.code) || '확인 불가']] : []),
    ...(o.message ? [['실패 사유', safeFailureMessage(o.message) || '확인할 실패 사유가 없습니다.']] : [])]) {
    appendDetail(dl, label, value);
  }
  $('result').append(heading, p, dl); status(o.stage === 'confirmed' || o.stage === 'refunded' ? '서버 처리 결과를 저장했습니다.' : '현재 상태를 저장했습니다.', o.stage === 'review' || o.stage === 'failed');
}
async function main() {
  const query = new URLSearchParams(location.search);
  if (location.pathname === '/fail') {
    // URL을 정리하기 전에 표시할 정보만 읽는다. 새로고침도 같은 안내를 유지한다.
    const previous = history.state?.paymentFailure;
    const failure = query.has('code') || query.has('message')
      ? { code: safeFailureCode(query.get('code')), message: safeFailureMessage(query.get('message')),
        orderId: query.get('demoOrderId') || query.get('orderId') }
      : { code: safeFailureCode(previous?.code), message: safeFailureMessage(previous?.message),
        orderId: query.get('demoOrderId') || previous?.orderId };
    const id = typeof failure.orderId === 'string' && /^ev_[a-f0-9-]{36}$/.test(failure.orderId) ? failure.orderId : null;
    history.replaceState({ paymentFailure: { code: failure.code, message: failure.message, orderId: id } }, '',
      id ? `/fail?demoOrderId=${encodeURIComponent(id)}` : '/fail');
    $('heading').textContent = '결제가 완료되지 않았습니다'; $('lead').textContent = '카드 인증이 취소되었거나 실패했습니다.';
    $('payment-heading').textContent = '인증 결과';
    $('payment-method').hidden = true; $('agreement').hidden = true; $('pay').hidden = true; $('back').hidden = false;
    showFailureDetails(failure.code, failure.message);
    status('결제 승인과 예약 확정을 처리하지 않았습니다.', true);
    if (id) {
      try { order = await api(`/api/order?orderId=${encodeURIComponent(id)}`); summary(order); }
      catch { document.querySelector('.summary').hidden = true; status('주문 정보는 조회하지 못했습니다. 아래는 결제창에서 전달받은 실패 안내입니다.', true); }
    } else { document.querySelector('.summary').hidden = true; }
    return;
  }
  if (location.pathname === '/success' || location.pathname === '/result') {
    const id = query.get('orderId'); if (!id) throw new Error('ORDER_ID_REQUIRED');
    order = await api(`/api/order?orderId=${encodeURIComponent(id)}`); summary(order);
    if (location.pathname === '/success') {
      $('pay').hidden = true; $('payment-method').hidden = true; $('agreement').hidden = true;
      const paymentKey = query.get('paymentKey'); const amountText = query.get('amount');
      history.replaceState(null, '', `/result?orderId=${encodeURIComponent(id)}`);
      if (!paymentKey || !amountText || !/^\d+$/.test(amountText)) throw new Error('INVALID_PAYMENT_PARAMETERS');
      status('토스 승인 응답을 확인하고 있습니다…');
      order = await api('/api/confirm', { orderId: id, amount: Number(amountText), paymentKey });
    }
    result(order); return;
  }
  const config = await api('/api/config');
  order = await api('/api/order', {}); summary(order);
  if (order.stage !== 'pending') { result(order); return; }
  if (typeof TossPayments !== 'function') throw new Error('TOSS_SDK_LOAD_FAILED');
  widgets = TossPayments(config.clientKey).widgets({ customerKey: order.customerKey });
  await widgets.setAmount({ currency: 'KRW', value: order.amount });
  methods = await widgets.renderPaymentMethods({ selector: '#payment-method', variantKey: 'DEFAULT' });
  await widgets.renderAgreement({ selector: '#agreement', variantKey: 'AGREEMENT' });
  status('신용·체크카드를 선택해 테스트 결제를 진행해 주세요.');
  const serverOffset = order.nowMs - Date.now();
  const tick = () => {
    const remaining = Math.max(0, order.expiresAtMs - (Date.now() + serverOffset));
    $('deadline').textContent = remaining ? `임시 점유 남은 시간 ${Math.floor(remaining / 60000)}분 ${Math.floor(remaining % 60000 / 1000)}초` : '임시 점유가 만료되었습니다. 주문 페이지를 새로 열어 주세요.';
    $('pay').disabled = remaining === 0;
  };
  tick(); timer = setInterval(tick, 1000);
  $('pay').onclick = async () => {
    if ((await methods.getSelectedPaymentMethod()).code !== 'CARD') { status('이 시연은 신용·체크카드만 지원합니다. 카드 결제를 선택해 주세요.', true); return; }
    $('pay').disabled = true; clearInterval(timer);
    try {
      await widgets.requestPayment({ orderId: order.orderId, orderName: order.orderName,
        successUrl: `${location.origin}/success`, failUrl: `${location.origin}/fail?demoOrderId=${encodeURIComponent(order.orderId)}`,
        windowTarget: 'self' });
    } catch (e) {
      showFailureDetails(e?.code, e?.message);
      status('결제가 완료되지 않았습니다. 승인 및 예약 확정은 처리하지 않았습니다.', true);
      tick(); timer = setInterval(tick, 1000);
    }
  };
}
main().catch(e => {
  $('pay').disabled = true;
  if (e?.code) showFailureDetails(e.code, e.message);
  const safe = typeof e?.message === 'string' && /^[A-Z_]+$/.test(e.message) ? e.message : 'WIDGET_OR_SERVER_ERROR';
  status(`화면을 준비하지 못했습니다 (${safe}). 결제 완료로 처리하지 않았습니다.`, true); $('back').hidden = false;
});
