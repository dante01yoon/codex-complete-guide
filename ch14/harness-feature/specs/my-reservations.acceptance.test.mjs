import test from 'node:test';
import assert from 'node:assert/strict';

// 새 기능 구현 전 사용자 확인 대상. 기존 tests/rules 파일은 변경하지 않는다.
const nowMs = Date.parse('2026-10-12T10:00:00+09:00');
const seed = [150, 60, 20].map((minutes, index) => ({
  reservationId: `demo-${index + 1}`,
  stationName: `테스트 충전소 ${index + 1}`,
  statId: `fixture-${index + 1}`, chgerId: '01',
  originalStartMs: nowMs + minutes * 60_000,
  endMs: nowMs + (minutes + 60) * 60_000,
  confirmedAtMs: nowMs - 60_000,
  depositAmount: 3000, status: 'confirmed', cancellationReason: null,
  refundAmount: 0, refundedAmount: 0,
}));

async function freshStore() {
  const { createReservationsDemo } = await import('../src/server/reservations.ts');
  return createReservationsDemo({ nowMs, reservations: seed });
}

test('AC-06-1: 시연 시계와 예약 세 건의 구간·기한·모의 금액을 제공한다', async () => {
  const store = await freshStore();
  const view = store.list();
  assert.equal(view.nowMs, nowMs);
  assert.equal(view.timezone, 'Asia/Seoul');
  assert.equal(view.mock, true);
  assert.equal(view.externalPayment, 'NOT_RUN');
  assert.deepEqual(view.reservations.map(row => row.remainingMinutes), [150, 60, 20]);
  assert.deepEqual(view.reservations.map(row => row.refundPreviewAmount), [3000, 1500, 0]);
  for (const [index, row] of view.reservations.entries()) {
    assert.equal(row.originalStartMs, seed[index].originalStartMs);
    assert.equal(row.endMs, seed[index].endMs);
    assert.equal(row.checkinDeadlineMs, seed[index].originalStartMs + 15 * 60_000);
    assert.equal(row.depositAmount, 3000);
    assert.equal(row.status, 'confirmed');
    assert.equal(row.refundedAmount, 0);
  }
});

for (const [index, amount, ac] of [[0, 3000, 'AC-07-1'], [1, 1500, 'AC-07-2'], [2, 0, 'AC-07-3']]) {
  test(`${ac}: ${[150, 60, 20][index]}분 전 모의 취소 후 ${amount}원 반환`, async () => {
    const store = await freshStore();
    const row = store.cancel(seed[index].reservationId);
    assert.equal(row.status, 'cancelled');
    assert.equal(row.cancellationReason, 'user');
    assert.equal(row.refundAmount, amount);
    assert.equal(row.refundedAmount, amount);
    assert.equal(row.originalStartMs, seed[index].originalStartMs);
  });
}

test('AC-07-4: 반복 취소는 추가 반환 없이 동일 결과이며 다른 예약을 보존한다', async () => {
  const store = await freshStore();
  const first = store.cancel('demo-2');
  assert.deepEqual(store.cancel('demo-2'), first);
  assert.deepEqual(store.list().reservations.map(row => row.status), ['confirmed', 'cancelled', 'confirmed']);
  assert.equal(store.list().reservations[1].refundedAmount, 1500);
});

test('AC-06-2: 모의 취소 결과는 재조회에 유지하고 외부 결제 실행으로 표시하지 않는다', async () => {
  const store = await freshStore();
  store.cancel('demo-1');
  const view = store.list();
  assert.equal(view.reservations[0].status, 'cancelled');
  assert.equal(view.reservations[0].refundedAmount, 3000);
  assert.equal(view.externalPayment, 'NOT_RUN');
});

test('브라우저 AC-06-1/2·AC-07-1~3: 확인 전 유지, 확인 후 모의 취소, 모바일 폭', async () => {
  const { chromium } = await import('playwright');
  const { spawn } = await import('node:child_process');
  const server = spawn(process.execPath, ['scripts/dev.mjs'], {
    cwd: new URL('..', import.meta.url), env: { ...process.env, PORT: '4183' }, stdio: 'pipe',
  });
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('server start timeout')), 10_000);
      server.stdout.on('data', chunk => {
        if (chunk.toString().includes('"kind":"start"')) { clearTimeout(timer); resolve(); }
      });
      server.on('error', reject);
      server.on('exit', code => reject(new Error(`server exited: ${code}`)));
    });
    await page.goto('http://127.0.0.1:4183');
    await page.getByRole('heading', { name: '내 예약', exact: true }).waitFor();
    const cards = page.locator('[data-reservation-id]');
    assert.equal(await cards.count(), 3);
    const expected = [['150분', '3,000원'], ['60분', '1,500원'], ['20분', '0원']];
    for (let index = 0; index < 3; index += 1) {
      const card = cards.nth(index);
      assert.ok((await card.innerText()).includes(expected[index][0]));
      assert.ok((await card.innerText()).includes(expected[index][1]));
      await card.getByRole('button', { name: '예약 취소', exact: true }).click();
      const dialog = page.getByRole('dialog');
      assert.ok((await dialog.innerText()).includes(expected[index][1]));
      await dialog.getByRole('button', { name: '예약 유지', exact: true }).click();
      assert.ok((await card.innerText()).includes('예약 확정'));
      await card.getByRole('button', { name: '예약 취소', exact: true }).click();
      await dialog.getByRole('button', { name: '모의 취소 확정', exact: true }).click();
      await card.getByText('사용자 취소', { exact: true }).waitFor();
      assert.ok((await card.innerText()).includes(expected[index][1]));
      assert.equal(await card.getByRole('button', { name: '예약 취소', exact: true }).count(), 0);
    }
    await page.reload();
    await page.getByText('사용자 취소', { exact: true }).first().waitFor();
    assert.equal(await page.getByText('사용자 취소', { exact: true }).count(), 3);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
  } finally {
    await browser.close();
    server.kill('SIGTERM');
  }
});
