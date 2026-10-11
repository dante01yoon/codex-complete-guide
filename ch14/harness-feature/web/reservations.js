const $ = id => document.getElementById(id);
const money = value => `${value.toLocaleString('ko-KR')}원`;
const dateLabel = value => new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul',
  month: 'long', day: 'numeric', weekday: 'short' }).format(new Date(value));
const timeLabel = value => new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul',
  hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(value));
let selected, previousFocus, busy = false;

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
function openConfirmation(row, button) {
  selected = row; previousFocus = button;
  $('dialog-summary').textContent = `${row.stationName} · 충전기 ${row.chgerId} / ${dateLabel(row.originalStartMs)} ${timeLabel(row.originalStartMs)}–${timeLabel(row.endMs)}`;
  $('dialog-amount').textContent = money(row.refundPreviewAmount);
  document.querySelector('.dialog-refund').classList.toggle('no-refund', row.refundPreviewAmount === 0);
  $('dialog-unreturned').textContent = `반환되지 않는 금액 ${money(row.unreturnedAmount)}`;
  $('dialog-error').textContent = '';
  $('cancel-dialog').showModal();
}
function renderCard(row) {
  const cancelled = row.status === 'cancelled';
  const card = element('article', `reservation-card${cancelled ? ' cancelled' : ''}`);
  card.dataset.reservationId = row.reservationId;
  const top = element('div', 'card-top');
  top.append(element('span', cancelled ? 'status cancelled-status' : 'status', cancelled ? '사용자 취소' : '예약 확정'),
    element('span', 'reservation-id', row.reservationId.toUpperCase()));
  const title = element('div', 'station-heading');
  title.append(element('span', 'station-icon', 'ϟ'), element('h3', '', row.stationName));
  card.append(top, title, element('p', 'station-address', row.address || '주소 정보 없음'),
    element('p', 'charger-id', `충전기 ${row.chgerId} · ${row.statId}`));
  const schedule = element('div', 'schedule');
  const date = element('div'); date.append(element('span', 'field-label', '예약 일정'),
    element('strong', '', dateLabel(row.originalStartMs)), element('span', 'time-range', `${timeLabel(row.originalStartMs)} — ${timeLabel(row.endMs)}`));
  const countdown = element('div', 'countdown'); countdown.append(element('span', 'field-label', cancelled ? '처리 결과' : '시작까지'),
    element('strong', '', cancelled ? '취소 완료' : row.remainingLabel));
  schedule.append(date, countdown); card.append(schedule);
  if (!cancelled) card.append(element('p', 'deadline', `체크인 기한 · ${dateLabel(row.checkinDeadlineMs)} ${timeLabel(row.checkinDeadlineMs)} 미만`));
  const refund = element('div', `refund-panel${row.refundPreviewAmount === 0 ? ' no-refund' : ''}`);
  const refundText = element('div'); refundText.append(element('span', '', cancelled ? '모의 취소 처리 결과' : '지금 취소하면 돌려받아요'),
    element('strong', '', money(cancelled ? row.refundedAmount : row.refundPreviewAmount)));
  refund.append(refundText, element('span', 'refund-tag', row.refundPreviewAmount === 3000 ? '전액 반환' : row.refundPreviewAmount === 1500 ? '50% 반환' : '환불 없음'));
  card.append(refund);
  const bottom = element('div', 'card-bottom');
  bottom.append(element('p', '', `예약금 ${money(row.depositAmount)} · 모의 결제 완료`));
  if (!cancelled) {
    const button = element('button', 'cancel-button', '예약 취소');
    button.addEventListener('click', () => openConfirmation(row, button)); bottom.append(button);
  } else bottom.append(element('span', 'result-label', '모의 처리 완료'));
  card.append(bottom); return card;
}
async function load() {
  $('retry').hidden = true;
  try {
    const response = await fetch('/api/reservations');
    if (!response.ok) throw new Error('예약을 불러오지 못했습니다. 다시 시도해 주세요.');
    const data = await response.json();
    $('clock').textContent = `${dateLabel(data.nowMs)} ${timeLabel(data.nowMs)}`;
    $('count').textContent = data.reservations.length;
    $('reservations').replaceChildren(...data.reservations.map(renderCard));
    $('notice').textContent = '';
    return true;
  } catch (error) {
    $('notice').textContent = error.message || '서버 연결을 확인해 주세요.';
    $('retry').hidden = false; return false;
  }
}
$('confirm').addEventListener('click', async () => {
  if (busy || !selected) return;
  busy = true; $('confirm').disabled = true; $('keep').disabled = true;
  $('confirm').textContent = '모의 처리 중…';
  try {
    const response = await fetch(`/api/reservations/${encodeURIComponent(selected.reservationId)}/cancel`,
      { method: 'POST', headers: { 'X-Demo-Request': 'cancel' } });
    if (!response.ok) throw new Error('취소 결과를 확인하지 못했습니다. 다시 시도해 주세요.');
    const row = await response.json();
    const card = document.querySelector(`[data-reservation-id="${row.reservationId}"]`);
    card.replaceWith(renderCard(row));
    $('cancel-dialog').close();
    $('notice').textContent = `예약이 취소되었습니다. 모의 반환 ${money(row.refundedAmount)}${row.refundedAmount === 0 ? ' · 환불 없음' : ''}.`;
    $('notice').tabIndex = -1; $('notice').focus();
  } catch (error) { $('dialog-error').textContent = error.message || '서버 연결을 확인해 주세요.'; }
  finally {
    busy = false; $('confirm').disabled = false; $('keep').disabled = false;
    $('confirm').textContent = '모의 취소 확정';
  }
});
$('cancel-dialog').addEventListener('cancel', event => { if (busy) event.preventDefault(); });
$('cancel-dialog').addEventListener('close', () => { if (previousFocus?.isConnected) previousFocus.focus(); selected = null; });
$('retry').addEventListener('click', load);
load();
