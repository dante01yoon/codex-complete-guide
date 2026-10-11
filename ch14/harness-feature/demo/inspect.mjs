import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const exec = promisify(execFile);
const options = (cwd) => ({ cwd, timeout: 120_000, maxBuffer: 8 * 1024 * 1024, windowsHide: true });

export async function refunds(root) {
  try {
    const file = join(root, 'src/rules/refund.ts');
    const hash = createHash('sha256').update(await readFile(file)).digest('hex');
    const module = await import(`${pathToFileURL(file).href}?source=${hash}`);
    const start = Date.parse('2026-10-06T14:00:00+09:00');
    const times = ['11:59:59', '12:00:00', '12:00:01', '13:29:59', '13:30:00', '13:30:01', '14:00:00'];
    const rows = times.map((time) => {
      const atMs = Date.parse(`2026-10-06T${time}+09:00`);
      const result = module.reduceUserCancellation({
        reservationId: 'demo', originalStartMs: start,
        confirmedAtMs: Date.parse('2026-10-05T10:00:00+09:00'),
        depositAmount: 3000, status: 'confirmed', cancellationReason: null,
        refundAmount: 0, refundedAmount: 0,
      }, { type: 'cancel', atMs });
      if (!Number.isSafeInteger(result.state.refundAmount)) throw new Error('Invalid amount');
      return { time, remainingSeconds: (start - atMs) / 1000, amount: result.state.refundAmount };
    });
    return { status: 'PASS', source: 'src/rules/refund.ts → reduceUserCancellation', hash, rows };
  } catch {
    return { status: 'BLOCKED', rows: [], message: '환불 모듈을 불러오거나 계산하지 못했습니다. Node.js 24와 기존 함수의 인터페이스를 확인하세요.' };
  }
}

export async function runTests(root) {
  const startedAt = new Date().toISOString();
  let directory;
  try {
    const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
    if (!pkg.scripts?.['test:rules']) throw new Error('Missing test script');
    directory = await mkdtemp(join(tmpdir(), 'harness-demo-'));
    const report = join(directory, 'vitest.json');
    let exitCode = 0;
    try {
      await exec(process.platform === 'win32' ? 'npm.cmd' : 'npm',
        ['run', 'test:rules', '--', '--reporter=json', `--outputFile=${report}`],
        { ...options(root), env: { ...process.env, NO_COLOR: '1' } });
    } catch (error) {
      exitCode = Number.isInteger(error.code) ? error.code : null;
    }
    const data = JSON.parse(await readFile(report, 'utf8'));
    const keys = ['numPassedTests', 'numFailedTests', 'numPendingTests', 'numTotalTests'];
    if (!keys.every((key) => Number.isSafeInteger(data[key]) && data[key] >= 0)) throw new Error('Invalid report');
    const status = exitCode === 0 && data.success === true && data.numTotalTests > 0 ? 'PASS' : 'FAIL';
    return {
      status, startedAt, finishedAt: new Date().toISOString(),
      command: 'npm run test:rules -- --reporter=json --outputFile=<임시 폴더>/vitest.json',
      passed: data.numPassedTests, failed: data.numFailedTests,
      skipped: data.numPendingTests, total: data.numTotalTests, exitCode,
      failedSuites: data.numFailedTestSuites ?? 0,
      message: status === 'FAIL' ? '테스트 실패 또는 수집·실행 오류가 있습니다. 기존 테스트 명령으로 진단하세요.' : '',
    };
  } catch {
    return { status: 'BLOCKED', startedAt, finishedAt: new Date().toISOString(),
      passed: null, failed: null, skipped: null, total: null,
      message: '실행 가능한 테스트 보고서를 얻지 못했습니다. 의존성과 package.json의 test:rules를 확인하세요.' };
  } finally {
    if (directory) await rm(directory, { recursive: true, force: true });
  }
}

export async function testChanges(root) {
  try {
    const git = async (...args) => (await exec('git', args, options(root))).stdout;
    const head = (await git('rev-parse', 'HEAD')).trim();
    const diff = await git('diff', '--no-ext-diff', '--no-textconv', '--relative', '--name-status', '--no-renames', '-z', 'HEAD', '--', 'tests');
    // Untracked files (including ignored files) are also additions relative to HEAD.
    const others = await git('ls-files', '--others', '-z', '--', 'tests');
    const parts = diff.split('\0').filter(Boolean);
    const files = [];
    for (let i = 0; i < parts.length; i += 2) files.push({ kind: parts[i], path: parts[i + 1] });
    for (const path of others.split('\0').filter(Boolean)) files.push({ kind: '?', path });
    return { status: files.length ? 'FAIL' : 'PASS', changed: files.length > 0, head, files,
      checkedAt: new Date().toISOString() };
  } catch {
    return { status: 'BLOCKED', changed: null, files: [],
      message: 'Git 또는 HEAD를 확인하지 못했습니다. 커밋이 있는 Git 작업 폴더에서 실행하세요.' };
  }
}
