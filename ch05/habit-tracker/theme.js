// 스타일 적용 전에 실행해 첫 화면의 테마 깜빡임을 줄인다.
(() => {
  const key = 'habit-tracker.theme.v1';
  const normalize = value => ['system', 'light', 'dark'].includes(value) ? value : 'system';
  const system = window.matchMedia('(prefers-color-scheme: dark)');
  let preference = 'system';
  let storageUnavailable = false;
  try { preference = normalize(localStorage.getItem(key)); }
  catch { storageUnavailable = true; }

  function apply() {
    const theme = preference === 'system' ? (system.matches ? 'dark' : 'light') : preference;
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#141e19' : '#f7f8f2');
    const select = document.getElementById('theme-select');
    if (select) select.value = preference;
    return theme;
  }

  apply();
  system.addEventListener('change', () => {
    if (preference === 'system') apply();
  });
  window.addEventListener('storage', event => {
    if (event.key !== key && event.key !== null) return;
    preference = normalize(event.key === null ? null : event.newValue);
    apply();
  });

  function connect() {
    apply();
    const select = document.getElementById('theme-select');
    const notice = document.getElementById('theme-notice');
    if (storageUnavailable) notice.textContent = '테마 설정을 읽을 수 없습니다. 전환은 가능하지만 다음 방문에 유지되지 않을 수 있어요.';
    select.addEventListener('change', () => {
      preference = normalize(select.value);
      const theme = apply();
      document.getElementById('theme-announcement').textContent = `${preference === 'system' ? '시스템 설정에 따라 ' : ''}${theme === 'dark' ? '다크' : '라이트'} 모드를 적용했어요.`;
      try {
        localStorage.setItem(key, preference);
        notice.textContent = '';
      } catch {
        notice.textContent = '테마는 전환했지만 설정을 저장하지 못했습니다. 다음 방문에는 이전 설정으로 돌아갈 수 있어요.';
      }
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', connect, { once: true });
  else connect();
})();
