import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash, randomUUID } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';

// Fixed limits: CLI arguments cannot silently increase this user's budget.
const MAX_ROUNDS = 5;
const MAX_MS = 20 * 60 * 1000;
const taskDescription = process.argv[2];
const root = fs.realpathSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'));
const start = process.hrtime.bigint();
const elapsed = () => Number(process.hrtime.bigint() - start) / 1e6;
const remaining = () => Math.max(0, MAX_MS - elapsed());
const sha = data => createHash('sha256').update(data).digest('hex');
const frozenRoots = [
  'tests', '.codex', 'AGENTS.md', '.specify/memory/constitution.md',
  'docs/prd.md', 'docs/acceptance.md', 'docs/tasks.md', 'docs/payment-test-review.md',
  'package.json', 'package-lock.json', 'vitest.config.ts', 'tsconfig.json',
  'scripts/loop.sh', 'scripts/loop.mjs',
];
const knownSecrets = Object.entries(process.env)
  .filter(([name, value]) => /KEY|TOKEN|SECRET|PASSWORD|AUTH/i.test(name) && value?.length >= 8)
  .map(([, value]) => value);
function redact(text) {
  let clean = String(text).replace(/\u001b\[[0-9;]*m/g, '');
  for (const secret of knownSecrets) clean = clean.split(secret).join('[REDACTED]');
  return clean
    .replace(/\b(?:li[v]e|te[s]t)_(?:g?ck|g?sk)_[A-Za-z0-9_-]+/g, '[REDACTED_KEY]')
    .replace(/\bsk-[A-Za-z0-9_-]{12,}/g, '[REDACTED_KEY]')
    .replace(/(Authorization["\s:=]+(?:Basic|Bearer)\s+)[A-Za-z0-9+/=._-]+/gi, '$1[REDACTED]');
}
function snapshot() {
  const entries = {};
  function visit(relative) {
    const absolute = path.join(root, relative);
    let stat;
    try { stat = fs.lstatSync(absolute, { bigint: true }); }
    catch (error) {
      if (error.code !== 'ENOENT') throw error;
      entries[relative] = { kind: 'absent' };
      return;
    }
    const meta = { mode: String(stat.mode), mtime: String(stat.mtimeNs), ctime: String(stat.ctimeNs) };
    if (stat.isSymbolicLink()) {
      entries[relative] = { ...meta, kind: 'symlink', target: fs.readlinkSync(absolute) };
    } else if (stat.isDirectory()) {
      entries[relative] = { ...meta, kind: 'directory' };
      for (const name of fs.readdirSync(absolute).sort()) visit(path.join(relative, name));
    } else if (stat.isFile()) {
      entries[relative] = { ...meta, kind: 'file', hash: sha(fs.readFileSync(absolute)) };
    } else {
      entries[relative] = { ...meta, kind: 'special' };
    }
  }
  frozenRoots.forEach(visit);
  return entries;
}
function changedPaths(before, after) {
  return [...new Set([...Object.keys(before), ...Object.keys(after)])]
    .filter(name => JSON.stringify(before[name]) !== JSON.stringify(after[name])).sort();
}
function git(args) {
  if (!remaining()) throw new Error('time_limit');
  const result = spawnSync('git', args, {
    cwd: root, encoding: 'utf8', timeout: Math.min(5000, remaining()), maxBuffer: 4 * 1024 * 1024,
    env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' },
  });
  if (result.error || result.status !== 0) throw new Error(`git 확인 실패: ${redact(result.stderr || result.error?.message)}`);
  return result.stdout;
}

let baseline;
let baselineHead;
let baselineIndex;
let logDir;
let lock;
let active;
let stopped;
let currentRound;
let testWatcher;
let previousTypeErrors = '';
let rounds = 0;
const streaks = new Map();
const results = [];
const lockPath = path.join(root, 'artifacts/loops/.running');
function writeJson(name, value) {
  fs.writeFileSync(path.join(logDir, name), redact(JSON.stringify(value, null, 2)) + '\n', { mode: 0o600 });
}
function stop(reason, detail = {}) {
  if (!stopped) stopped = { reason, detail, at: new Date().toISOString(), elapsedMs: elapsed() };
  active?.terminate();
}
process.on('SIGINT', () => stop('interrupted', { signal: 'SIGINT' }));
process.on('SIGTERM', () => stop('interrupted', { signal: 'SIGTERM' }));
function checkIntegrity() {
  if (remaining() <= 0) return stop('time_limit');
  if (!baseline) return;
  try {
    const changed = changedPaths(baseline, snapshot());
    if (changed.length) return stop(changed.some(name => name === 'tests' || name.startsWith('tests/'))
      ? 'tests_changed' : 'protected_files_changed', { changedPaths: changed });
  } catch (error) { stop('integrity_check_failed', { error: redact(error.message) }); }
}
// Output is inspected while the child is running; a hook block stops that round immediately.
function interruption(text) {
  const cleaned = text.replace(/\u001b\[[0-9;]*m/g, '');
  const pattern = /(?:^|\n)(?:guard:\s*BLOCKED|verify:\s*(?:FAIL|BLOCKED)|Command blocked by PreToolUse hook)/;
  if (pattern.test(cleaned)) return 'hook_blocked';
  try {
    const event = JSON.parse(cleaned);
    const item = event.item;
    const message = event.message || event.error?.message || item?.text || item?.aggregated_output || '';
    if (pattern.test(message)) return 'hook_blocked';
    if (item?.type === 'agent_message' && /\bBLOCKED\b/.test(message)) return 'agent_blocked';
    if (event.type === 'error' || event.type === 'turn.failed') return 'codex_reported_error';
    return null;
  } catch { return null; }
}
async function run(command, args, label, input = '') {
  checkIntegrity();
  if (stopped) return { status: 'BLOCKED', command: [command, ...args], reason: stopped.reason };
  const stdout = fs.createWriteStream(path.join(logDir, `${label}.stdout.log`), { mode: 0o600 });
  const stderr = fs.createWriteStream(path.join(logDir, `${label}.stderr.log`), { mode: 0o600 });
  for (const stream of [stdout, stderr]) stream.on('error', error => stop('log_write_failed', { phase: label, error: redact(error.message) }));
  const began = elapsed();
  let child;
  let killTimer;
  let spawnError;
  const buffers = { stdout: '', stderr: '' };
  const processLine = (line, stream) => {
    stream.write(redact(line) + '\n');
    const reason = interruption(line);
    if (reason) stop(reason, { phase: label, message: redact(line).slice(0, 1200) });
  };
  try {
    child = spawn(command, args, { cwd: root, detached: true, stdio: ['pipe', 'pipe', 'pipe'] });
    function signalGroup(signal) {
      try { process.kill(-child.pid, signal); }
      catch (error) { if (error.code !== 'ESRCH') child.kill(signal); }
    }
    active = { terminate() {
      signalGroup(remaining() <= 0 ? 'SIGKILL' : 'SIGTERM');
      if (!killTimer) killTimer = setTimeout(() => signalGroup('SIGKILL'), Math.min(300, remaining()));
    } };
    for (const [name, stream] of [['stdout', stdout], ['stderr', stderr]]) {
      child[name].setEncoding('utf8');
      child[name].on('data', chunk => {
        buffers[name] += chunk;
        let end;
        while ((end = buffers[name].indexOf('\n')) !== -1) {
          processLine(buffers[name].slice(0, end), stream);
          buffers[name] = buffers[name].slice(end + 1);
        }
        if (buffers[name].length > 1024 * 1024) {
          buffers[name] = '';
          stop('output_line_too_large', { phase: label });
        }
      });
    }
    child.stdin.on('error', error => { if (error.code !== 'EPIPE') spawnError = error.message; });
    child.stdin.end(input);
    const deadlineTimer = setTimeout(() => stop('time_limit'), remaining());
    const watcher = setInterval(checkIntegrity, 200);
    const [code, signal] = await new Promise(resolve => {
      child.once('error', error => { spawnError = error.message; });
      child.once('close', (code, signal) => resolve([code, signal]));
    });
    clearTimeout(deadlineTimer);
    clearInterval(watcher);
    clearTimeout(killTimer);
    // Kill leftover children in this command's process group, including background commands.
    signalGroup('SIGKILL');
    for (const [name, stream] of [['stdout', stdout], ['stderr', stderr]]) {
      if (buffers[name]) processLine(buffers[name], stream);
    }
    checkIntegrity();
    return {
      command: [command, ...args], exitCode: code, signal,
      status: stopped ? 'BLOCKED' : code === 0 ? 'PASS' : 'FAIL',
      elapsedMs: elapsed() - began, ...(spawnError ? { error: redact(spawnError) } : {}),
    };
  } finally {
    active = undefined;
    await Promise.all([stdout, stderr].map(stream => new Promise(resolve => {
      if (stream.destroyed) return resolve();
      stream.once('error', resolve);
      stream.end(resolve);
    })));
  }
}
function parseTests(filename) {
  const text = fs.readFileSync(filename, 'utf8');
  // Keep only sanitized reports on disk, including assertion failure messages.
  fs.writeFileSync(filename, redact(text), { mode: 0o600 });
  const report = JSON.parse(text);
  const cases = new Map();
  const actualFiles = [];
  if (!Array.isArray(report.testResults)) throw new Error('Vitest JSON testResults 누락');
  for (const file of report.testResults) {
    if (!Array.isArray(file.assertionResults) || !file.assertionResults.length || file.message) {
      throw new Error('Vitest 사례 누락 또는 파일 수집/런타임 오류');
    }
    actualFiles.push(path.relative(root, file.name));
    for (const test of file.assertionResults) {
      const relative = path.relative(root, file.name);
      if (relative.startsWith('..') || !test.fullName || !['passed', 'failed'].includes(test.status)) {
        throw new Error('테스트 식별자 누락 또는 skip/todo/비정상 상태');
      }
      const id = JSON.stringify([relative, test.fullName]);
      if (cases.has(id)) throw new Error('중복 테스트 식별자');
      cases.set(id, { file: relative, name: test.fullName, status: test.status,
        failureMessages: (test.failureMessages || []).map(redact) });
    }
  }
  const expectedFiles = Object.entries(baseline)
    .filter(([name, entry]) => /^tests\/rules\/.*\.test\.ts$/.test(name) && entry.kind === 'file')
    .map(([name]) => name).sort();
  if (JSON.stringify(actualFiles.sort()) !== JSON.stringify(expectedFiles)) throw new Error('승인 테스트 파일이 보고서에서 누락 또는 추가됨');
  if (!cases.size || cases.size !== report.numTotalTests || report.numPendingTests !== 0
      || report.numTodoTests !== 0 || (report.numRuntimeErrorTestSuites || 0) > 0) {
    throw new Error('빈 테스트·수집 실패·skip/todo·런타임 오류는 성공으로 처리할 수 없음');
  }
  const passed = [...cases.values()].filter(test => test.status === 'passed').length;
  if (passed !== report.numPassedTests || cases.size - passed !== report.numFailedTests) {
    throw new Error('Vitest 사례 수와 요약 불일치');
  }
  return { cases, passed, failed: cases.size - passed, success: report.success === true };
}
async function verify(label, expectedIds) {
  const reportPath = path.join(logDir, `${label}.vitest.json`);
  const tests = await run('npm', ['run', 'test:rules', '--', '--reporter=json', `--outputFile=${reportPath}`], `${label}.tests`);
  let parsed;
  if (!stopped) {
    try {
      parsed = parseTests(reportPath);
      if (expectedIds && JSON.stringify([...parsed.cases.keys()].sort()) !== expectedIds) {
        throw new Error('기준 검사와 테스트 파일/이름 집합이 달라짐');
      }
      if (tests.exitCode !== (parsed.failed ? 1 : 0) || (!parsed.failed && !parsed.success)) {
        throw new Error('테스트 종료 코드·성공 상태 불일치');
      }
    } catch (error) { stop('test_report_invalid', { error: redact(error.message), phase: label }); }
  }
  const types = stopped ? { status: 'NOT_RUN' } : await run('npm', ['run', 'typecheck'], `${label}.types`);
  if (types.status === 'FAIL') {
    previousTypeErrors = ['stdout', 'stderr'].map(stream =>
      redact(fs.readFileSync(path.join(logDir, `${label}.types.${stream}.log`), 'utf8'))).join('\n');
  } else if (types.status === 'PASS') previousTypeErrors = '';
  return { tests, types, parsed };
}
function prompt(round, failures) {
  return `다음 사용자가 요청한 작업 범위의 순수 규칙만 구현한다.
작업 설명 시작:\n${taskDescription}\n작업 설명 끝.
현재 수정 바퀴 ${round}/${MAX_ROUNDS}. 외부 감독 루프가 테스트와 타입 검사를 실행한다.
AGENTS.md, 헌법, docs/prd.md, docs/acceptance.md, docs/tasks.md를 먼저 읽는다.
작업 설명에 해당하는 US·AC·T·C, 선행 작업의 완료 근거, 테스트 사용자 확인 근거를 확인한다.
관련 테스트 검토 문서와 테스트 계약은 해당 작업에 맞게 찾아 각각 읽는다.
테스트가 커밋되어 있다는 사실만으로 사용자 확인이 완료됐다고 간주하지 않는다.
승인 근거·선행 조건이 없거나 미확정 정책에 의존하면 수정하지 말고 BLOCKED와 필요한 사용자 결정을 보고한다.
셸 도구 호출 하나에는 단일 명령만 넣고, 결과를 확인한 뒤 다음 명령을 별도로 호출한다.
읽기 명령도 줄바꿈·세미콜론·&&·파이프·리다이렉션·명령 치환으로 묶지 않는다.
특히 tests/와 .codex/ 및 저장소 루트를 참조하는 복합 명령은 읽기 전용이어도 가드가 차단한다.
문서는 각각 cat <파일>로 읽는다. 상태·파일 탐색은 아래 명령을 각각 별도 도구 호출로 실행한다:
  git status --short
  rg --files src/rules
  rg --files tests/rules
  cat .specify/memory/constitution.md
작업에 해당하는 테스트·fixture 파일은 cat <파일>로 각각 별도 호출로 읽는다.
소스 수정은 src/rules 아래 파일을 대상으로 apply_patch를 사용한다.
이 절차는 차단 전 예방 지침이다. 실제 훅 차단이 발생하면 명령 분리 등으로 재시도하지 말고 즉시 중단한다.
src/rules의 순수 함수와 공개 export만 수정한다. tests/, .codex/, 설정, 정책 문서, 루프·로그는 변경하지 않는다.
외부 루프의 기준 검사·직전 실패 근거를 확인하고 요청 작업의 승인된 실패 테스트에 대응하는 구현만 수정한다.
다른 작업의 실패를 이유로 요청 범위를 넓히지 않는다. 같은 테스트의 연속 실패는 외부 루프가 기록하며 세 번째 바퀴 실패 즉시 중단한다.
테스트는 직접 실행하지 않는다. 훅이 검사·차단하면 즉시 중단하고 BLOCKED를 보고한다. 자동 수정 요청도 재시도하지 않는다.
테스트 skip·기대값 완화·훅 우회·비활성화·스위치 조작·설치·커밋·배포·네트워크/실제 토스 API 호출은 금지한다.
미확정 C 항목·조건부 AC·문서에 없는 정책은 구현하지 않는다. 화면·HTTP/서버·외부 연결은 이 순수 규칙 루프의 범위 밖이다.
다른 사람이 만든 변경을 되돌리지 않는다. 이번 바퀴는 구현 수정과 변경 이유 보고까지만 한다.
실패 사례(파일+전체 이름으로 식별):\n${redact(JSON.stringify(failures, null, 2))}
직전 타입 검사 오류:\n${previousTypeErrors || '없음'}\n`;
}

try {
  if (process.argv.length !== 3 || !taskDescription?.trim()) {
    throw new Error('사용법: scripts/loop.sh "작업 설명" — 비어 있지 않은 인수 1개가 필요합니다 (최대 5회·20분 고정).');
  }
  fs.mkdirSync(path.dirname(lockPath), { recursive: true, mode: 0o700 });
  fs.mkdirSync(lockPath, { mode: 0o700 });
  lock = true;
  logDir = path.join(root, 'artifacts/loops', new Date().toISOString().replaceAll(':', '-') + '-' + randomUUID().slice(0, 8));
  fs.mkdirSync(logDir, { mode: 0o700 });
  console.log(`기록: ${logDir}`);
  try {
    fs.lstatSync(path.join(root, '.codex/TEST_WRITING'));
    throw new Error('사용자 TEST_WRITING 스위치를 먼저 꺼야 구현 루프를 시작할 수 있습니다.');
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  baselineHead = git(['rev-parse', 'HEAD']).trim();
  if (git(['status', '--porcelain=v1', '--untracked-files=all', '--', 'tests']).trim()) {
    throw new Error('승인 테스트가 커밋 상태와 다릅니다. 사용자가 먼저 확인·커밋해야 합니다.');
  }
  baselineIndex = git(['ls-files', '--stage', '-z', '--', 'tests']);
  if (!baselineIndex) throw new Error('커밋된 테스트가 없습니다.');
  baseline = snapshot();
  const trackedTests = new Set(git(['ls-files', '-z', '--', 'tests']).split('\0').filter(Boolean));
  if (Object.entries(baseline).some(([name, entry]) => name.startsWith('tests/') && entry.kind === 'file' && !trackedTests.has(name))) {
    throw new Error('커밋되지 않은 테스트 파일(무시된 파일 포함)이 있습니다.');
  }
  if (Object.entries(baseline).some(([name, entry]) => name.startsWith('tests/') && ['symlink', 'special'].includes(entry.kind))) {
    throw new Error('테스트 경로는 일반 파일·디렉터리만 지원합니다.');
  }
  writeJson('baseline-files.json', baseline);
  writeJson('run.json', { taskDescription, head: baselineHead, maxRounds: MAX_ROUNDS, maxMs: MAX_MS, startedAt: new Date().toISOString() });
  testWatcher = fs.watch(path.join(root, 'tests'), { recursive: true }, (_event, name) => {
    stop('tests_changed', { changedPaths: [name ? path.join('tests', String(name)) : 'tests'] });
  });
  testWatcher.on('error', error => stop('integrity_check_failed', { error: redact(error.message) }));
  const initial = await verify('baseline');
  const { parsed, ...baselineCommands } = initial;
  writeJson('baseline.json', { ...baselineCommands, cases: parsed ? [...parsed.cases.values()] : [] });
  if (!stopped && parsed.failed === 0 && initial.types.status === 'PASS') stop('already_passing');
  const expectedIds = parsed ? JSON.stringify([...parsed.cases.keys()].sort()) : undefined;
  let failures = parsed ? [...parsed.cases.values()].filter(test => test.status === 'failed') : [];
  for (let round = 1; round <= MAX_ROUNDS && !stopped; round++) {
    rounds = round;
    const label = `round-${String(round).padStart(2, '0')}`;
    currentRound = { round, startedAt: new Date().toISOString(), beforeFailures: failures };
    writeJson(`${label}.json`, currentRound);
    const task = prompt(round, failures);
    fs.writeFileSync(path.join(logDir, `${label}.prompt.txt`), task, { mode: 0o600 });
    currentRound.codex = await run('codex', ['exec', '--sandbox', 'workspace-write', '--json', '--color', 'never', '-C', root, '-'], label + '.codex', task);
    if (!stopped && currentRound.codex.status !== 'PASS') stop('codex_failed', { round, result: currentRound.codex });
    if (!stopped) {
      if (git(['rev-parse', 'HEAD']).trim() !== baselineHead || git(['ls-files', '--stage', '-z', '--', 'tests']) !== baselineIndex) {
        stop('git_baseline_changed', { round });
      }
    }
    if (!stopped) {
      const checked = await verify(label, expectedIds);
      currentRound.tests = checked.tests;
      currentRound.types = checked.types;
      if (checked.parsed) {
        for (const [id, test] of checked.parsed.cases) streaks.set(id, test.status === 'failed' ? (streaks.get(id) || 0) + 1 : 0);
        failures = [...checked.parsed.cases.values()].filter(test => test.status === 'failed');
        currentRound.failedCases = failures.map(test => ({ ...test, consecutiveRounds: streaks.get(JSON.stringify([test.file, test.name])) }));
        currentRound.passed = checked.parsed.passed;
        currentRound.failed = checked.parsed.failed;
        if (!stopped && currentRound.failedCases.some(test => test.consecutiveRounds >= 3)) stop('same_test_failed_three_rounds', { cases: currentRound.failedCases.filter(test => test.consecutiveRounds >= 3) });
        if (!stopped && checked.tests.status === 'PASS' && checked.types.status === 'PASS') stop('all_passing');
      }
    }
    currentRound.endedAt = new Date().toISOString();
    currentRound.stop = stopped;
    writeJson(`${label}.json`, currentRound);
    results.push(currentRound);
    console.log(`${label}: tests=${currentRound.tests?.status || 'NOT_RUN'}, types=${currentRound.types?.status || 'NOT_RUN'}${stopped ? ', stop=' + stopped.reason : ''}`);
    currentRound = undefined;
  }
  if (!stopped) stop('round_limit');
} catch (error) {
  stop(lock ? 'preflight_or_runtime_error' : 'lock_or_startup_error', { error: redact(error.message) });
} finally {
  testWatcher?.close();
  try { if (logDir) {
    if (currentRound) {
      currentRound.stop = stopped;
      currentRound.endedAt = new Date().toISOString();
      writeJson(`round-${String(currentRound.round).padStart(2, '0')}.json`, currentRound);
    }
    writeJson('summary.json', {
      status: ['all_passing', 'already_passing'].includes(stopped?.reason) ? 'PASS'
        : ['round_limit', 'same_test_failed_three_rounds'].includes(stopped?.reason) ? 'FAIL' : 'BLOCKED',
      rounds, stop: stopped, elapsedMs: elapsed(), completedRounds: results.length,
    });
  } } catch (error) {
    console.error(`기록 저장 실패: ${redact(error.message)}`);
    stopped = { reason: 'log_write_failed', detail: { originalStop: stopped?.reason } };
  } finally { if (lock) fs.rmdirSync(lockPath); }
  console.log(`종료: ${stopped?.reason || 'unknown'} (${rounds}회, ${Math.round(elapsed() / 1000)}초)`);
  process.exitCode = ['all_passing', 'already_passing'].includes(stopped?.reason) ? 0
    : stopped?.reason === 'time_limit' ? 124
      : ['round_limit', 'same_test_failed_three_rounds'].includes(stopped?.reason) ? 1 : 2;
}
