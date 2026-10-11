import { createServer } from 'node:http';
import { readFile, realpath } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { join, resolve, basename } from 'node:path';
import { pathToFileURL } from 'node:url';
import config from './config.mjs';
import { getRefundExamples } from './adapter.mjs';

const execute = promisify(execFile);
const demoRoot = import.meta.dirname;
const projectRoot = resolve(process.env.DEMO_PROJECT_ROOT || join(demoRoot, '..'));
const redact = value => String(value ?? '')
  .replace(/\b(?:test|live)_(?:sk|ck|gsk|gck)_[A-Za-z0-9_-]+/g, '[REDACTED]')
  .replace(/(authorization\s*[:=]\s*|bearer\s+|basic\s+)[^\s]+/gi, '$1[REDACTED]');

export async function refundExamples(root) {
  try { return { ...await getRefundExamples(root), checkedAt: new Date().toISOString() }; }
  catch { return { status: 'BLOCKED', timezone: 'Asia/Seoul', examples: [],
    message: '환불 모듈을 읽을 수 없습니다. demo/adapter.mjs를 이 프로젝트에 맞게 설정해 주세요.',
    externalPayment: 'NOT_RUN' }; }
}

export async function runCheck(command, root, timeoutMs = config.timeoutMs) {
  if (!command?.length) return { status: 'NOT_RUN', command: null, output: '검사 명령이 설정되지 않았습니다.' };
  const startedAt = new Date().toISOString();
  const started = Date.now();
  let status, exitCode = null, output;
  try {
    const result = await execute(command[0], command.slice(1), {
      cwd: root, timeout: timeoutMs, maxBuffer: 2 * 1024 * 1024, windowsHide: true,
      env: { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0' },
    });
    status = 'PASS'; exitCode = 0;
    output = result.stdout + result.stderr;
  } catch (error) {
    exitCode = Number.isInteger(error.code) ? error.code : null;
    status = exitCode !== null ? 'FAIL' : 'BLOCKED';
    output = error.killed ? '검사 제한 시간을 초과했습니다.'
      : error.stdout || error.stderr ? (error.stdout || '') + (error.stderr || '')
        : '검사 명령 또는 실행 폴더를 사용할 수 없습니다.';
  }
  return { status, exitCode, command: command.join(' '), startedAt,
    finishedAt: new Date().toISOString(), durationMs: Date.now() - started,
    output: redact(output).replace(/\x1b\[[0-9;]*m/g, '').slice(-24_000) };
}

export async function inspectTests(root) {
  const git = async (...args) => (await execute('git', ['-c', 'core.fsmonitor=false', ...args],
    { cwd: root, timeout: 10_000, maxBuffer: 2 * 1024 * 1024,
      env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' } })).stdout;
  try {
    const top = (await git('rev-parse', '--show-toplevel')).trim();
    if (await realpath(root) !== await realpath(top)) throw new Error('not-root');
    const baseline = (await git('rev-parse', '--verify', 'HEAD')).trim();
    const tracked = (await git('ls-files', '-z', '--', 'tests')).split('\0').filter(Boolean);
    const raw = await git('-c', 'status.renames=false', 'status', '--porcelain=v1', '-z', '--untracked-files=all', '--', 'tests');
    const files = raw.split('\0').filter(Boolean).map(entry => {
      const code = entry.slice(0, 2);
      const kind = code.includes('U') || ['AA', 'DD'].includes(code) ? 'conflict'
        : code.includes('D') ? 'deleted' : code.includes('A') || code === '??' ? 'added' : 'modified';
      return { path: entry.slice(3), code, kind };
    }).sort((a, b) => a.path.localeCompare(b.path));
    return { status: 'PASS', baseline, trackedCount: tracked.length,
      changed: files.length > 0, files, checkedAt: new Date().toISOString() };
  } catch {
    return { status: 'BLOCKED', changed: null, files: [],
      message: 'Git 저장소 루트와 HEAD 커밋이 필요합니다. DEMO_PROJECT_ROOT를 확인해 주세요.' };
  }
}

const staticFiles = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/app.js', ['app.js', 'text/javascript; charset=utf-8']],
  ['/style.css', ['style.css', 'text/css; charset=utf-8']],
]);

export function createDashboard(root = projectRoot) {
  let checking = false;
  let checks = config.checks.map(check => ({ ...check, command: check.command?.join(' '), status: 'NOT_RUN', output: '아직 실행하지 않았습니다.' }));
  const snapshot = async () => ({ project: config.title || basename(root), checking, checks,
    refund: await refundExamples(root), tests: await inspectTests(root) });
  return createServer(async (req, res) => {
    const host = req.headers.host;
    if (!/^127\.0\.0\.1:\d+$/.test(host || '')) { res.writeHead(403); res.end('허용하지 않는 호스트'); return; }
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'");
    const url = new URL(req.url, `http://${host}`);
    const json = (code, value) => { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(value)); };
    try {
      if (req.method === 'GET' && url.pathname === '/api/status') { json(200, await snapshot()); return; }
      if (req.method === 'POST' && url.pathname === '/api/verify') {
        if (req.headers.origin !== `http://${host}` || req.headers['x-demo-request'] !== 'verify') {
          json(403, { message: '같은 출처의 확인 화면에서만 검사를 실행할 수 있습니다.' }); return;
        }
        if (checking) { json(409, { message: '검사가 실행 중입니다.' }); return; }
        checking = true;
        try {
          for (let i = 0; i < config.checks.length; i++) {
            const check = config.checks[i];
            checks[i] = { id: check.id, label: check.label, ...await runCheck(check.command, root) };
          }
        } finally { checking = false; }
        json(200, await snapshot()); return;
      }
      const file = staticFiles.get(url.pathname);
      if (req.method === 'GET' && file) {
        const body = await readFile(join(demoRoot, file[0]));
        res.writeHead(200, { 'Content-Type': file[1] }); res.end(body); return;
      }
      json(404, { message: '찾을 수 없는 경로입니다.' });
    } catch { json(500, { message: '조회에 실패했습니다. 서버와 프로젝트 설정을 확인해 주세요.' }); }
  });
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const server = createDashboard();
  server.on('error', error => {
    console.error(error.code === 'EADDRINUSE' ? `포트 ${config.port}가 이미 사용 중입니다.` : '서버를 시작할 수 없습니다.');
    process.exitCode = 1;
  });
  server.listen(config.port, '127.0.0.1', () => console.log(`하네스 확인 화면: http://127.0.0.1:${config.port}`));
}
