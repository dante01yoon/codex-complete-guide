const list = document.querySelector('#loop-list');
const detail = document.querySelector('#detail');
const totals = document.querySelector('#totals');
const notice = document.querySelector('#notice');
const refresh = document.querySelector('#refresh');
let loops = [];
let selectedId = null;

const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const statusOf = value => ['PASS', 'FAIL', 'BLOCKED', 'NOT_RUN'].includes(value) ? value : 'NOT_RUN';
const badge = status => `<span class="badge ${statusOf(status)}">${statusOf(status)}</span>`;
const pad = value => String(value).padStart(2, '0');
const chevron = '<svg class="chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>';
const arrow = '<svg class="arrow" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12h17m-6-6 6 6-6 6"/></svg>';
const stopLabels = {
  all_passing: '모든 검사 통과로 종료', already_passing: '시작 전 검사에서 모두 통과',
  agent_blocked: '에이전트 차단으로 중단', hook_blocked: '훅 차단으로 중단',
  test_report_invalid: '테스트 보고서 오류로 중단', same_test_failed_three_rounds: '같은 테스트 3회 연속 실패로 중단',
  time_limit: '시간 한도 도달로 종료', round_limit: '최대 바퀴 수 도달로 종료',
  tests_changed: '테스트 파일 변경 감지로 중단', protected_files_changed: '보호 파일 변경 감지로 중단',
  git_baseline_changed: 'Git 기준 변경 감지로 중단', integrity_check_failed: '무결성 검사 실패로 중단',
  codex_failed: '에이전트 실행 실패로 중단', codex_reported_error: '에이전트 오류 보고로 중단',
  interrupted: '실행 중단 신호로 종료', log_write_failed: '기록 저장 실패로 중단',
  output_line_too_large: '출력 크기 한도 초과로 중단',
  preflight_or_runtime_error: '사전 검사 또는 실행 오류로 중단', lock_or_startup_error: '시작 또는 실행 잠금 오류로 중단',
};

function time(value) {
  if (!value || !Number.isFinite(Date.parse(value))) return '시각 기록 없음';
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Seoul', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(value)).map(part => [part.type, part.value]));
  return `${parts.month}. ${parts.day}. ${parts.hour}:${parts.minute}:${parts.second}`;
}

function duration(ms) {
  if (!Number.isFinite(ms) || ms < 0) return '기록 없음';
  if (ms < 1000) return `${Math.round(ms)}ms`;
  const seconds = Math.round(ms / 1000);
  return seconds >= 60 ? `${Math.floor(seconds / 60)}분 ${pad(seconds % 60)}초` : `${seconds}초`;
}

function testDetail(result) {
  if (result.invalid) return '보고서 집계 불가';
  if (result.passed !== null && result.failed !== null) return `${result.passed} 통과 · ${result.failed} 실패`;
  return result.tests.status === 'NOT_RUN' ? '검사하지 않음' : '사례 집계 기록 없음';
}

function checkRow(label, result, text) {
  const status = result?.status || 'NOT_RUN';
  return `<tr><td>${label}</td><td>${badge(status)}</td><td class="result-detail">${escape(text || (status === 'NOT_RUN' ? '검사하지 않음' : duration(result.elapsedMs)))}</td></tr>`;
}

function table(rows, caption) {
  return `<table class="result-table" aria-label="${escape(caption)}"><thead><tr><th scope="col">검사 항목</th><th scope="col">결과</th><th scope="col">상세</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function disclosure(title, content, extra = '') {
  return `<details class="disclosure"><summary><span>${escape(title)}${extra}</span>${chevron}</summary><div class="disclosure-content">${content}</div></details>`;
}

function failureCases(cases) {
  return cases.map(item => `<article class="case"><code>${escape(item.file)}</code><h4>${escape(item.name)}</h4>${item.consecutiveRounds ? `<p class="case-count">연속 실패 ${escape(item.consecutiveRounds)}회</p>` : ''}<pre>${escape((item.failureMessages || []).join('\n') || '오류 상세 기록 없음')}</pre></article>`).join('');
}

function renderList() {
  list.innerHTML = loops.length ? loops.map((loop, index) => `<button type="button" class="loop-button" data-loop="${escape(loop.id)}" aria-current="${loop.id === selectedId}" aria-label="루프 ${pad(index + 1)}, ${loop.status}"><span class="loop-top"><strong>루프 ${pad(index + 1)}</strong>${badge(loop.status)}</span><code class="loop-id">${escape(loop.id.split('-').at(-1))}</code><span class="loop-time">${escape(time(loop.run?.startedAt))} · 서울</span></button>`).join('') : '<p class="empty loop-empty">실행 기록이 없습니다.</p>';
  const current = list.querySelector('[aria-current="true"]');
  if (current && matchMedia('(max-width: 760px)').matches) {
    list.scrollLeft = current.offsetLeft - list.offsetLeft - 12;
  }
}

function renderTotals() {
  const values = [
    [loops.length, '전체 루프', ''],
    [loops.filter(loop => loop.status === 'PASS').length, 'PASS', 'good'],
    [loops.filter(loop => loop.status === 'BLOCKED').length, 'BLOCKED', 'bad'],
    [loops.reduce((sum, loop) => sum + loop.rounds.length, 0), '실행 바퀴', ''],
  ];
  totals.innerHTML = values.map(([value, title, color]) => `<div class="total"><strong>${value}</strong><span class="${color}">${title}</span></div>`).join('');
}

function roundStep(round) {
  const rows = checkRow('수정', round.codex) + checkRow('테스트', round.tests, testDetail(round)) + checkRow('타입', round.types);
  const failures = round.failedCases.length ? disclosure(`이 바퀴의 실패 사례 ${round.failedCases.length}개`, failureCases(round.failedCases)) : '';
  return `<li class="step"><div class="step-title"><h3>${pad(round.number)} 바퀴</h3><p>${escape(time(round.startedAt))}</p><p>${round.endedAt ? `종료 ${escape(time(round.endedAt))}` : '종료 시각 기록 없음'}</p></div><div class="step-body">${table(rows, `${round.number} 바퀴 검사 결과`)}${failures}</div></li>`;
}

function renderDetail() {
  const loop = loops.find(item => item.id === selectedId);
  if (!loop) { detail.innerHTML = '<p class="empty">artifacts/loops에 기록이 생기면 새로고침해 주세요.</p>'; return; }
  const number = pad(loops.indexOf(loop) + 1);
  const last = loop.rounds.at(-1);
  const firstFailed = loop.baseline.failed;
  const finalFailed = last?.failed ?? (loop.rounds.length ? null : firstFailed);
  const final = finalFailed !== null ? `<span class="number ${finalFailed === 0 ? 'good' : 'bad'}">${finalFailed}</span>` : '<span>미검증</span>';
  const failures = `<strong class="failure-count">실패 <span class="number ${firstFailed === null ? '' : 'bad'}">${firstFailed === null ? '—' : firstFailed}</span>${arrow}${final}</strong>`;
  const reason = loop.stop?.reason;
  const endTitle = reason ? stopLabels[reason] || '기록된 사유로 종료' : '종료 기록 없음';
  const endIcon = loop.status === 'PASS'
    ? '<svg class="end-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="11" fill="currentColor"/><path d="m7 12 3 3 7-7" stroke="white" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>'
    : '<svg class="end-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="1.8" fill="none"/><path d="M12 6v7m0 3v1" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';
  const baselineRows = checkRow('테스트', loop.baseline.tests, testDetail(loop.baseline)) + checkRow('타입', loop.baseline.types);
  const end = `<li class="step end-step"><div class="step-body"><div class="end-band ${loop.status}"><div class="end-main">${endIcon}<div><h3>${escape(endTitle)}</h3><p>${escape(time(loop.stop?.at))}${loop.stop?.detail?.phase ? ` · ${escape(loop.stop.detail.phase)}` : ''}</p></div></div><div class="reason"><span>종료 사유 (원문)</span><code>${escape(reason || '기록 없음')}</code></div></div>${loop.stopMessage ? `<div class="stop-message">${escape(loop.stopMessage)}</div>` : ''}${!loop.rounds.length ? '<p class="duration">수정 바퀴에 진입하지 않았습니다.</p>' : ''}</div></li>`;
  const initialCases = loop.baseline.failedCases;
  const rawEntries = [
    ['run.json', loop.raw.run], ['baseline.json', loop.raw.baseline],
    ...loop.raw.rounds.map(round => [`round-${pad(round.round)}.json`, round]), ['summary.json', loop.raw.summary],
  ];
  const raw = rawEntries.map(([name, value]) => `<details class="raw"><summary>${escape(name)}</summary><pre>${escape(value ? JSON.stringify(value, null, 2) : '파일 기록 없음')}</pre></details>`).join('');
  detail.innerHTML = `<div class="detail-heading"><h2>루프 ${number}</h2>${badge(loop.status)}</div><p class="detail-time">${escape(time(loop.run?.startedAt))} · 서울 · <code>${escape(loop.id.split('-').at(-1))}</code></p><p class="task ${loop.run?.taskDescription ? '' : 'missing-task'}">${escape(loop.run?.taskDescription || '작업 설명이 기록되지 않은 실행입니다.')}</p>${loop.warnings.length ? `<p class="warning">${escape(loop.warnings.join('\n'))}</p>` : ''}${loop.summaryMissing ? '<p class="warning">summary.json이 없어 최종 상태를 확인할 수 없습니다. 저장된 기록만 표시합니다.</p>' : ''}<div class="metrics"><div class="metric">${failures}<span class="caption">시작 전 → 마지막 검사</span></div><div class="metric"><strong>${escape(duration(loop.elapsedMs))}</strong><span class="caption">소요 시간</span></div><div class="metric"><strong>${loop.rounds.length} / ${escape(loop.run?.maxRounds ?? '—')} 바퀴</strong><span class="caption">최대 ${escape(duration(loop.run?.maxMs))}</span></div></div><ol class="timeline"><li class="step"><div class="step-title"><h3>시작 전 검사</h3><p>${escape(time(loop.run?.startedAt))}</p></div><div class="step-body">${table(baselineRows, '시작 전 검사 결과')}</div></li>${loop.rounds.map(roundStep).join('')}${end}</ol>${disclosure(loop.baseline.invalid ? '시작 전 실패 사례 · 집계 불가' : `시작 전 실패 사례 ${initialCases.length}개`, initialCases.length ? failureCases(initialCases) : `<p class="legend">${loop.baseline.invalid ? '보고서가 유효하지 않아 사례를 집계할 수 없습니다.' : '저장된 실패 사례가 없습니다.'}</p>`, '<span class="case-count"> · 원래 실패의 근거</span>')}${disclosure('원문 기록', raw)}<p class="legend">PASS 통과 · FAIL 실패 · BLOCKED 차단 · NOT_RUN 실행하지 않음<br>저장된 기록을 표시합니다. 새 루프나 검사를 실행하지 않습니다.</p>`;
}

async function load() {
  refresh.disabled = true;
  refresh.setAttribute('aria-busy', 'true');
  try {
    const response = await fetch('/api/loops', { cache: 'no-store' });
    if (!response.ok) throw new Error('기록을 읽지 못했습니다. 서버와 JSON 파일을 확인해 주세요.');
    const data = await response.json();
    loops = data.loops;
    if (!loops.some(loop => loop.id === selectedId)) selectedId = loops.at(-1)?.id ?? null;
    notice.textContent = data.warnings.join('\n');
    notice.hidden = !data.warnings.length;
    renderList(); renderTotals(); renderDetail();
  } catch (error) {
    notice.textContent = error.message;
    notice.hidden = false;
    if (!loops.length) { list.innerHTML = '<p class="empty">기록을 불러오지 못했습니다.</p>'; detail.innerHTML = '<p class="empty">기록 새로고침으로 다시 시도해 주세요.</p>'; }
  } finally {
    refresh.disabled = false;
    refresh.removeAttribute('aria-busy');
  }
}

list.addEventListener('click', event => {
  const button = event.target.closest('[data-loop]');
  if (!button) return;
  selectedId = button.dataset.loop;
  renderList(); renderDetail();
  list.querySelector(`[data-loop="${CSS.escape(selectedId)}"]`)?.focus({ preventScroll: true });
});
refresh.addEventListener('click', load);
load();
