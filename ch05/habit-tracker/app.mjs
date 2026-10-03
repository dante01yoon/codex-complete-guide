import { localDateKey, streak, heatmapWeeks, displayDate } from './dates.mjs';
import { STORAGE_KEY, readHabits, toggleRecord } from './model.mjs';

const $ = selector => document.querySelector(selector);
let habits = [];
let today = localDateKey();
let readable = true;
let dialogHabitId = null;
const error = $('#storage-error');

function storageError(message) {
  error.textContent = message;
  error.hidden = false;
}

try { habits = readHabits(localStorage.getItem(STORAGE_KEY)); }
catch {
  readable = false;
  storageError('저장된 기록을 읽을 수 없습니다. 기존 데이터는 덮어쓰지 않았습니다. 브라우저의 저장 권한을 확인한 뒤 새로고침해 주세요.');
}

function commit(next, message) {
  if (!readable) return false;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, habits: next }));
  } catch {
    storageError('기록을 저장하지 못했습니다. 변경은 적용하지 않았습니다. 브라우저의 저장 공간과 권한을 확인해 주세요.');
    return false;
  }
  habits = next;
  error.hidden = true;
  render();
  $('#announcement').textContent = message;
  return true;
}

function node(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function button(text, className, action, habitId) {
  const element = node('button', className, text);
  element.type = 'button';
  element.dataset.action = action;
  element.dataset.habit = habitId;
  element.disabled = !readable;
  return element;
}

function habitCard(habit) {
  const card = node('article', 'habit-card');
  card.dataset.habit = habit.id;
  const top = node('div', 'card-top');
  const done = habit.records.includes(today);
  const toggle = button(done ? '✓' : '＋', 'today-toggle', 'today', habit.id);
  toggle.setAttribute('aria-label', `${habit.name} 오늘 ${done ? '완료 취소' : '완료 체크'}`);
  toggle.setAttribute('aria-pressed', String(done));
  toggle.disabled ||= habit.createdAt > today;
  const info = node('div', 'habit-info');
  info.append(node('h3', '', habit.name), node('p', 'habit-status', done ? '오늘의 약속을 지켰어요' : '오늘의 한 칸을 기다리고 있어요'));
  const streakLabel = node('div', 'streak');
  const count = streak(habit.records, habit.createdAt, today);
  streakLabel.setAttribute('aria-label', `연속 실천 ${count}일`);
  streakLabel.append(node('strong', '', String(count)), node('span', '', '일 연속'));
  top.append(toggle, info, streakLabel);
  const actions = node('div', 'card-actions');
  const edit = button('이름 수정', 'text-button', 'edit', habit.id);
  edit.setAttribute('aria-label', `${habit.name} 이름 수정`);
  const remove = button('삭제', 'text-button', 'delete', habit.id);
  remove.setAttribute('aria-label', `${habit.name} 삭제`);
  actions.append(edit, remove);
  const section = node('div', 'heatmap-section');
  const weeks = heatmapWeeks(habit.records, habit.createdAt, today);
  const heading = node('div', 'heatmap-title');
  heading.append(node('h4', '', '최근 12주'), node('span', 'date-range', `${displayDate(weeks[0][0].date)} — ${displayDate(today)}`));
  const layout = node('div', 'heatmap-layout');
  const weekdays = node('div', 'weekdays');
  weekdays.setAttribute('aria-hidden', 'true');
  for (const day of ['월', '화', '수', '목', '금', '토', '일']) weekdays.append(node('span', '', day));
  const grid = node('div', 'heatmap');
  grid.setAttribute('role', 'group');
  grid.setAttribute('aria-label', `${habit.name} 최근 12주 기록`);
  const statusNames = { done: '완료', missed: '미완료', before: '등록 전', future: '미래 날짜' };
  for (const week of weeks) {
    const column = node('div', 'week');
    for (const cell of week) {
      const day = button('', `day ${cell.status}${cell.date === today ? ' today' : ''}`, 'date', habit.id);
      day.dataset.date = cell.date;
      day.setAttribute('aria-label', `${cell.date} ${statusNames[cell.status]}${cell.date === today ? ' (오늘)' : ''}`);
      day.title = `${cell.date} · ${statusNames[cell.status]}`;
      day.setAttribute('aria-pressed', String(cell.status === 'done'));
      day.disabled ||= cell.status === 'before' || cell.status === 'future';
      column.append(day);
    }
    grid.append(column);
  }
  layout.append(weekdays, grid);
  const legend = node('div', 'legend');
  for (const [className, label] of [['', '미완료'], ['done', '완료'], ['before', '등록 전'], ['today', '오늘']]) {
    const item = node('span');
    const swatch = node('i', `swatch ${className}`);
    swatch.setAttribute('aria-hidden', 'true');
    item.append(swatch, document.createTextNode(label));
    legend.append(item);
  }
  const form = node('form', 'record-form');
  form.dataset.habit = habit.id;
  const label = node('label', '', '지난 기록');
  label.htmlFor = `record-${habit.id}`;
  const input = node('input');
  input.type = 'date';
  input.id = label.htmlFor;
  input.name = 'date';
  input.min = habit.createdAt;
  input.max = today;
  input.value = today;
  input.required = true;
  input.disabled = !readable || habit.createdAt > today;
  input.setAttribute('aria-label', `${habit.name} 기록 날짜`);
  const save = node('button', 'secondary', '체크 / 취소');
  save.type = 'submit';
  save.disabled = input.disabled;
  form.append(label, input, save);
  section.append(heading, layout, legend, form, node('p', 'heatmap-hint', '날짜 칸을 누르면 체크하거나 취소할 수 있어요.'));
  card.append(top, actions, section);
  return card;
}

function render() {
  const active = document.activeElement;
  const focus = active?.dataset.action ? { habit: active.dataset.habit, action: active.dataset.action, date: active.dataset.date } : null;
  today = localDateKey();
  $('#today-label').textContent = new Intl.DateTimeFormat('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' }).format(new Date());
  const completed = habits.filter(habit => habit.records.includes(today)).length;
  $('#done-count').textContent = completed;
  $('#total-count').textContent = ` / ${habits.length}개 완료`;
  $('#habit-count').textContent = habits.length;
  const percent = habits.length ? Math.round(completed / habits.length * 100) : 0;
  $('.progress').setAttribute('aria-valuenow', percent);
  $('#progress-fill').style.width = `${percent}%`;
  $('#summary-message').textContent = !habits.length ? '첫 번째 습관을 추가해 보세요' : completed === habits.length ? '오늘의 약속을 모두 지켰어요!' : '한 칸씩, 나만의 속도로 채워요';
  $('#habits').replaceChildren(...habits.map(habitCard));
  $('#empty-state').hidden = habits.length > 0 || !readable;
  $('#habit-name').disabled = !readable;
  $('#add-form button').disabled = !readable;
  if (focus) {
    const target = [...document.querySelectorAll('button[data-action]')].find(b => b.dataset.habit === focus.habit && b.dataset.action === focus.action && b.dataset.date === focus.date);
    target?.focus({ preventScroll: true });
  }
}

function refreshDay() {
  if (today !== localDateKey()) render();
}

function toggle(habit, date) {
  refreshDay();
  try {
    const updated = toggleRecord(habit, date, today);
    return commit(habits.map(item => item.id === habit.id ? updated : item), `${habit.name} · ${displayDate(date)} ${updated.records.includes(date) ? '완료로 기록했어요.' : '완료를 취소했어요.'}`);
  } catch (e) { $('#announcement').textContent = e.message; return false; }
}

$('#add-form').addEventListener('submit', event => {
  event.preventDefault();
  const input = $('#habit-name');
  const name = input.value.trim();
  if (!name) { input.setCustomValidity('습관 이름을 입력해 주세요.'); input.reportValidity(); return; }
  refreshDay();
  if (commit([...habits, { id: crypto.randomUUID(), name, createdAt: today, records: [] }], `${name} 습관을 추가했어요.`)) input.value = '';
  input.focus();
});
for (const input of [$('#habit-name'), $('#edit-name')]) input.addEventListener('input', () => input.setCustomValidity(''));

$('#habits').addEventListener('click', event => {
  const target = event.target.closest('button[data-action]');
  if (!target || target.disabled) return;
  const habit = habits.find(item => item.id === target.dataset.habit);
  if (!habit) return;
  if (target.dataset.action === 'today') { refreshDay(); toggle(habit, today); }
  else if (target.dataset.action === 'date') toggle(habit, target.dataset.date);
  else {
    dialogHabitId = habit.id;
    if (target.dataset.action === 'edit') {
      $('#edit-name').setCustomValidity('');
      $('#edit-name').value = habit.name;
      $('#edit-dialog').showModal();
      $('#edit-name').select();
    } else {
      $('#delete-description').textContent = `“${habit.name}” 습관을 삭제합니다.`;
      $('#delete-dialog').showModal();
      $('#delete-dialog [data-close]').focus();
    }
  }
});

$('#habits').addEventListener('submit', event => {
  if (!event.target.matches('.record-form')) return;
  event.preventDefault();
  const habit = habits.find(item => item.id === event.target.dataset.habit);
  const input = event.target.elements.date;
  const date = input.value;
  const inputId = input.id;
  if (habit && toggle(habit, date)) {
    const replacement = document.getElementById(inputId);
    replacement.value = date;
    replacement.focus({ preventScroll: true });
  }
});

for (const close of document.querySelectorAll('[data-close]')) close.addEventListener('click', () => close.closest('dialog').close());
function focusHabitAction(action) {
  const target = [...document.querySelectorAll('button[data-action]')].find(b => b.dataset.habit === dialogHabitId && b.dataset.action === action);
  (target ?? $('#habit-name')).focus({ preventScroll: true });
}
$('#edit-form').addEventListener('submit', event => {
  event.preventDefault();
  const input = $('#edit-name');
  const name = input.value.trim();
  if (!name) { input.setCustomValidity('습관 이름을 입력해 주세요.'); input.reportValidity(); return; }
  if (commit(habits.map(habit => habit.id === dialogHabitId ? { ...habit, name } : habit), '습관 이름을 수정했어요.')) {
    $('#edit-dialog').close();
    focusHabitAction('edit');
  }
});
$('#confirm-delete').addEventListener('click', () => {
  if (commit(habits.filter(habit => habit.id !== dialogHabitId), '습관과 관련 기록을 삭제했어요.')) {
    $('#delete-dialog').close();
    $('#habit-name').focus();
  }
});

// 다른 탭의 변경을 반영해 오래된 상태로 저장하는 일을 줄인다.
window.addEventListener('storage', event => {
  if (event.key !== STORAGE_KEY && event.key !== null) return;
  try {
    const next = readHabits(localStorage.getItem(STORAGE_KEY));
    habits = next;
    readable = true;
    error.hidden = true;
    for (const dialog of document.querySelectorAll('dialog[open]')) dialog.close();
    render();
  } catch {
    readable = false;
    storageError('다른 탭에서 변경된 기록을 읽을 수 없습니다. 기존 데이터를 덮어쓰지 않도록 편집을 멈췄습니다.');
    render();
  }
});
window.addEventListener('focus', refreshDay);
document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshDay(); });
setInterval(refreshDay, 15_000);
render();
