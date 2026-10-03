import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const source = readFileSync(new URL('./theme.js', import.meta.url), 'utf8');
const key = 'habit-tracker.theme.v1';

// 실제 테마 스크립트를 실행하되 브라우저의 저장 실패·시스템 변경을 제어한다.
// 실제 브라우저의 화면·키보드 검증과는 별개의 자동 검사다.
function browser({ stored, dark = false, readFails = false, writeFails = false } = {}) {
  const saved = new Map([['habit-tracker.v1', '기존 습관 데이터']]);
  if (stored !== undefined) saved.set(key, stored);
  const root = { dataset: {}, style: {} };
  const listeners = {};
  const media = { matches: dark, addEventListener: (name, fn) => { listeners.media = fn; } };
  const select = { value: 'system', addEventListener: (name, fn) => { listeners.select = fn; } };
  const notice = { textContent: '' };
  const announcement = { textContent: '' };
  const meta = { setAttribute: (name, value) => { meta[name] = value; } };
  let ready = false;
  const document = {
    readyState: 'loading', documentElement: root,
    querySelector: () => meta,
    getElementById: id => ready ? { 'theme-select': select, 'theme-notice': notice, 'theme-announcement': announcement }[id] : null,
    addEventListener: (name, fn) => { listeners.ready = fn; }
  };
  const window = { matchMedia: () => media, addEventListener: (name, fn) => { listeners.storage = fn; } };
  const localStorage = {
    getItem: name => { if (readFails) throw new Error('저장 읽기 차단'); return saved.get(name) ?? null; },
    setItem: (name, value) => { if (writeFails) throw new Error('저장 쓰기 차단'); saved.set(name, value); }
  };
  runInNewContext(source, { document, window, localStorage });
  return {
    root, saved, select, notice, announcement, meta,
    ready: () => { ready = true; listeners.ready(); },
    change: value => { select.value = value; listeners.select(); },
    system: value => { media.matches = value; listeners.media(); },
    storage: event => listeners.storage(event)
  };
}

test('최초 시스템 테마를 DOM 준비 전에 적용해 첫 화면 깜빡임 최소화', () => {
  for (const dark of [false, true]) {
    const b = browser({ dark });
    assert.equal(b.root.dataset.theme, dark ? 'dark' : 'light');
    assert.equal(b.root.style.colorScheme, dark ? 'dark' : 'light');
    assert.equal(b.meta.content, dark ? '#141e19' : '#f7f8f2');
    b.ready();
    assert.equal(b.select.value, 'system');
  }
});
test('수동 선택 저장·재방문 복원 및 습관 데이터 보존', () => {
  const b = browser(); b.ready(); b.change('dark');
  assert.equal(b.root.dataset.theme, 'dark');
  assert.equal(b.saved.get(key), 'dark');
  assert.equal(b.saved.get('habit-tracker.v1'), '기존 습관 데이터');
  const reopened = browser({ stored: b.saved.get(key) }); reopened.ready();
  assert.equal(reopened.root.dataset.theme, 'dark');
  assert.equal(reopened.select.value, 'dark');
  b.change('light');
  assert.equal(b.root.dataset.theme, 'light');
  assert.equal(b.saved.get(key), 'light');
});
test('시스템 변경은 시스템 선택일 때만 반영', () => {
  const b = browser(); b.ready(); b.system(true);
  assert.equal(b.root.dataset.theme, 'dark');
  b.change('light'); b.system(false); b.system(true);
  assert.equal(b.root.dataset.theme, 'light');
  b.change('system');
  assert.equal(b.root.dataset.theme, 'dark');
  assert.equal(b.saved.get(key), 'system');
  b.system(false);
  assert.equal(b.root.dataset.theme, 'light');
});
test('잘못된 저장값은 시스템 설정으로 복구', () => {
  const b = browser({ stored: 'unknown', dark: true }); b.ready();
  assert.equal(b.select.value, 'system');
  assert.equal(b.root.dataset.theme, 'dark');
});
test('저장 읽기·쓰기 실패 시에도 전환 가능하고 한국어 안내 표시', () => {
  const b = browser({ readFails: true, writeFails: true }); b.ready();
  assert.match(b.notice.textContent, /읽을 수 없습니다/);
  b.change('dark');
  assert.equal(b.root.dataset.theme, 'dark');
  assert.match(b.notice.textContent, /저장하지 못했습니다/);
  assert.match(b.announcement.textContent, /다크 모드/);
  assert.equal(b.saved.get('habit-tracker.v1'), '기존 습관 데이터');
});
test('다른 탭의 테마 변경·삭제·전체 초기화 반영, 습관 이벤트 무시', () => {
  const b = browser({ dark: true }); b.ready();
  b.storage({ key, newValue: 'light' });
  assert.equal(b.select.value, 'light');
  b.storage({ key: 'habit-tracker.v1', newValue: '{}' });
  assert.equal(b.root.dataset.theme, 'light');
  b.storage({ key, newValue: null });
  assert.equal(b.select.value, 'system');
  assert.equal(b.root.dataset.theme, 'dark');
  b.change('light'); b.storage({ key: null });
  assert.equal(b.root.dataset.theme, 'dark');
});
test('테마 스크립트는 스타일시트보다 먼저 일반 스크립트로 로드', () => {
  const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
  assert.ok(html.indexOf('<script src="theme.js"></script>') < html.indexOf('href="styles.css"'));
});

test('두 테마의 주요 글자 대비와 히트맵 완료·미완료 구분', () => {
  const css = readFileSync(new URL('./styles.css', import.meta.url), 'utf8');
  const palettes = [...css.matchAll(/:root(?:\[data-theme="dark"\])?\{([^}]+)\}/g)].map(match => Object.fromEntries([...match[1].matchAll(/(--[\w-]+):(#\w+)/g)].map(m => [m[1], m[2]])));
  assert.equal(palettes.length, 2);
  function luminance(hex) {
    const rgb = hex.slice(1).match(/../g).slice(0, 3).map(part => parseInt(part, 16) / 255).map(c => c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4);
    return rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722;
  }
  function contrast(a, b) { const values = [luminance(a), luminance(b)].sort((x, y) => y - x); return (values[0] + .05) / (values[1] + .05); }
  for (const p of palettes) {
    for (const [fg, bg] of [['--text','--page'], ['--text','--surface'], ['--muted','--surface'], ['--placeholder','--surface'], ['--on-accent','--green'], ['--on-accent','--danger-bg'], ['--streak-text','--streak-bg'], ['--error-text','--error-bg'], ['--summary-text','--summary-bg'], ['--secondary-text','--secondary-bg']]) {
      assert.ok(contrast(p[fg],p[bg]) >= 4.5, `${fg} / ${bg} 글자 대비`);
    }
    assert.ok(contrast(p['--done'],p['--missed']) >= 3, '히트맵 완료·미완료 대비');
  }
});
