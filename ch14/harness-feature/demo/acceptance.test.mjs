import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

// Import inside each case so missing implementation produces a named failure.
test('AC-DEMO-01: 기존 환불 함수로 서울 시각 경계 금액을 표시한다', async () => {
  const { refundExamples } = await import('./server.mjs');
  const result = await refundExamples(join(import.meta.dirname, '..'));
  assert.equal(result.status, 'PASS');
  assert.equal(result.timezone, 'Asia/Seoul');
  assert.deepEqual(result.examples.map(row => row.amount), [3000, 3000, 1500, 1500, 1500, 0, 0, 0]);
  assert.deepEqual(result.examples.map(row => row.at), ['11:59:59', '12:00:00', '12:00:01', '13:29:59', '13:30:00', '13:30:01', '14:00:00', '14:05:00']);
  assert.equal(result.externalPayment, 'NOT_RUN');
});

test('AC-DEMO-02: 실행한 검사 결과만 PASS로 표시하고 미설정 검사는 NOT_RUN이다', async () => {
  const { runCheck } = await import('./server.mjs');
  assert.equal((await runCheck(null, process.cwd())).status, 'NOT_RUN');
  const pass = await runCheck([process.execPath, '-e', 'process.exit(0)'], process.cwd());
  assert.equal(pass.status, 'PASS');
  assert.equal(pass.exitCode, 0);
  const fail = await runCheck([process.execPath, '-e', 'process.exit(1)'], process.cwd());
  assert.equal(fail.status, 'FAIL');
  assert.equal(fail.exitCode, 1);
  assert.equal((await runCheck(['missing-demo-command'], process.cwd())).status, 'BLOCKED');
});

test('AC-DEMO-03: HEAD 대비 tests 수정·추가·삭제를 구분하고 읽기만 한다', async () => {
  const { inspectTests } = await import('./server.mjs');
  const root = await mkdtemp(join(tmpdir(), 'harness-demo-'));
  const git = (...args) => execFileSync('git', args, { cwd: root, stdio: 'pipe' });
  try {
    git('init');
    git('config', 'user.email', 'demo@example.invalid');
    git('config', 'user.name', 'Demo fixture');
    await mkdir(join(root, 'tests'));
    await writeFile(join(root, 'tests', 'one.txt'), 'original');
    await writeFile(join(root, 'tests', 'two.txt'), 'original');
    git('add', '.');
    git('commit', '-m', 'fixture');
    assert.equal((await inspectTests(root)).changed, false);
    await writeFile(join(root, 'tests', 'one.txt'), 'changed');
    await writeFile(join(root, 'tests', 'new.txt'), 'new');
    await rm(join(root, 'tests', 'two.txt'));
    const before = git('status', '--porcelain').toString();
    const result = await inspectTests(root);
    assert.equal(result.status, 'PASS');
    assert.equal(result.changed, true);
    assert.deepEqual(result.files.map(file => [file.path, file.kind]).sort(), [
      ['tests/new.txt', 'added'], ['tests/one.txt', 'modified'], ['tests/two.txt', 'deleted'],
    ]);
    assert.equal(git('status', '--porcelain').toString(), before);
    assert.equal((await inspectTests(join(root, 'tests'))).status, 'BLOCKED');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
