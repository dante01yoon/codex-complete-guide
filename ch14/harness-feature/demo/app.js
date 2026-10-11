const $ = id => document.getElementById(id);
const money = value => `${value.toLocaleString('ko-KR')}원`;
const stamp = value => value ? new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(new Date(value)) + ' (서울)' : '미실행';
const remaining = seconds => {
  if (seconds === 0) return '시작 시각';
  const absolute = Math.abs(seconds);
  return `${Math.floor(absolute / 60)}분${absolute % 60 ? ` ${absolute % 60}초` : ''} ${seconds > 0 ? '전' : '후'}`;
};
function badge(status, text = status) {
  const el = document.createElement('span'); el.className = `badge ${status.toLowerCase()}`; el.textContent = text; return el;
}
let examples = [], busy = false;
function selectMoment() {
  const row = examples[Number($('moment').value)];
  if (!row) return;
  $('selected-amount').textContent = money(row.amount);
  $('selected-detail').textContent = `${row.at} 취소 · ${remaining(row.remainingSeconds)}`;
  document.querySelectorAll('#refund-rows tr').forEach((el, i) => el.classList.toggle('selected', i === Number($('moment').value)));
}
function render(data) {
  $('project').textContent = data.project;
  const previous = $('moment').value;
  examples = data.refund.examples;
  $('refund-summary').textContent = data.refund.status === 'PASS' ? '경계값 8개 계산' : 'BLOCKED';
  $('refund-rows').replaceChildren(); $('moment').replaceChildren();
  examples.forEach((row, i) => {
    const tr = document.createElement('tr');
    for (const value of [row.at, remaining(row.remainingSeconds), money(row.amount)]) {
      const td = document.createElement('td'); td.textContent = value; tr.append(td);
    }
    $('refund-rows').append(tr);
    const option = document.createElement('option'); option.value = i; option.textContent = `${row.at} · ${remaining(row.remainingSeconds)}`; $('moment').append(option);
  });
  $('moment').disabled = !examples.length;
  $('refund-source').textContent = data.refund.source || data.refund.message;
  if (examples.length) { $('moment').value = previous || '1'; selectMoment(); }
  else { $('selected-amount').textContent = 'BLOCKED'; $('selected-detail').textContent = '어댑터 설정 필요'; }
  const failed = data.checks.find(check => ['FAIL', 'BLOCKED'].includes(check.status));
  const passed = data.checks.filter(check => check.status === 'PASS').length;
  $('check-summary').textContent = data.checking ? '실행 중' : failed ? failed.status : passed === data.checks.length && passed > 0 ? `PASS · ${passed}개 검사` : 'NOT_RUN';
  $('check-time').textContent = data.checks.some(check => check.finishedAt) ? `최근 실행 ${stamp(data.checks.findLast(check => check.finishedAt).finishedAt)}` : '아직 실행하지 않음';
  $('checks').replaceChildren();
  data.checks.forEach(check => {
    const container = document.createElement('div'); container.className = 'check';
    const heading = document.createElement('div'); heading.className = 'check-heading';
    const name = document.createElement('h3'); name.textContent = check.label;
    heading.append(name, badge(check.status));
    const meta = document.createElement('div'); meta.className = 'check-meta';
    meta.textContent = `${check.command || '명령 미설정'} · 종료 코드 ${check.exitCode ?? '—'} · ${stamp(check.finishedAt)}${check.durationMs !== undefined ? ` · ${check.durationMs}ms` : ''}`;
    const details = document.createElement('details');
    const summary = document.createElement('summary'); summary.textContent = '실행 출력 보기';
    const pre = document.createElement('pre'); pre.textContent = check.output;
    details.append(summary, pre); container.append(heading, meta, details); $('checks').append(container);
  });
  const integrity = data.tests;
  const description = integrity.status === 'BLOCKED' ? integrity.message : integrity.changed ? `${integrity.files.length}개 파일이 HEAD와 다릅니다.` : 'tests 폴더에 HEAD 이후 변경이 없습니다.';
  $('test-summary').textContent = integrity.status === 'BLOCKED' ? 'BLOCKED' : integrity.changed ? `변경 ${integrity.files.length}개` : '변경 없음';
  $('integrity-state').replaceWith(Object.assign(badge(integrity.status === 'BLOCKED' ? 'BLOCKED' : integrity.changed ? 'BLOCKED' : 'PASS', integrity.status === 'BLOCKED' ? 'BLOCKED' : integrity.changed ? '변경 있음' : '변경 없음'), { id: 'integrity-state' }));
  $('integrity-description').textContent = description;
  $('baseline').textContent = integrity.baseline ? integrity.baseline.slice(0, 12) : 'HEAD 없음';
  $('baseline').title = integrity.baseline || '';
  $('tracked').textContent = integrity.trackedCount !== undefined ? `추적 파일 ${integrity.trackedCount}개 · 조회 ${stamp(integrity.checkedAt)}` : '';
  $('changed-files').replaceChildren();
  const labels = { added: '추가', modified: '수정', deleted: '삭제', conflict: '충돌' };
  integrity.files.forEach(file => {
    const li = document.createElement('li'); const code = document.createElement('code'); code.textContent = file.path;
    li.append(badge('BLOCKED', labels[file.kind]), code); $('changed-files').append(li);
  });
  $('verify').disabled = data.checking || busy;
}
async function load(verify = false) {
  if (busy) return;
  busy = true;
  for (const id of ['verify', 'refresh', 'integrity-refresh']) $(id).disabled = true;
  $('notice').textContent = verify ? '검사를 실행하는 중입니다. 각 명령은 최대 120초까지 기다립니다.' : '프로젝트 상태를 읽는 중입니다.';
  try {
    const response = await fetch(verify ? '/api/verify' : '/api/status', verify ? { method: 'POST', headers: { 'X-Demo-Request': 'verify' } } : {});
    const data = await response.json();
    if (!response.ok) throw new Error(data.message);
    render(data);
    $('notice').textContent = verify ? '검사가 끝났습니다. 아래 상태와 실행 출력을 확인해 주세요.' : '조회 완료 · 검사를 실행하거나 테스트 파일을 변경하지 않았습니다.';
  } catch (error) { $('notice').textContent = error.message || '서버에 연결할 수 없습니다.'; }
  finally { busy = false; for (const id of ['verify', 'refresh', 'integrity-refresh']) $(id).disabled = false; }
}
$('moment').addEventListener('change', selectMoment);
$('refresh').addEventListener('click', () => load());
$('integrity-refresh').addEventListener('click', () => load());
$('verify').addEventListener('click', () => load(true));
load();
