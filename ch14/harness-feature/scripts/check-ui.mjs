import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { randomUUID } from 'node:crypto';
import { root, artifactRoot, logPath, baseURL, redact, stringify } from './ui-config.mjs';

const startedAt = new Date().toISOString();
const output = resolve(artifactRoot, `${startedAt.replace(/[:.]/g, '-')}-${randomUUID().slice(0, 8)}`);
await mkdir(output, { recursive: true });
const report = { status: 'PASS', startedAt, url: baseURL, server: null, screens: [], issues: [] };
let ownedServer, browser, health;
let childOutput = '';
const abort = new AbortController();
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => abort.abort());

async function probe() {
  let response;
  try { response = await fetch(`${baseURL}/__ui_health`, { signal: AbortSignal.timeout(800) }); }
  catch (error) {
    if (error.cause?.code === 'ECONNREFUSED') return null;
    throw new Error('서버에 접속할 수 없거나 응답 시간이 초과됐습니다.');
  }
  let data;
  try { data = await response.json(); } catch { /* unrelated server */ }
  if (!response.ok || data?.service !== 'ev-booking-ui' || data.root !== root || !data.sessionId) {
    throw new Error('이 포트는 현재 프로젝트의 UI 서버가 아닙니다. PORT를 변경하세요.');
  }
  return data;
}
async function stopOwnedServer() {
  if (!ownedServer || ownedServer.exitCode !== null || ownedServer.signalCode !== null) return;
  const exited = new Promise(resolveExit => ownedServer.once('exit', resolveExit));
  ownedServer.kill('SIGTERM');
  const timer = setTimeout(() => ownedServer.kill('SIGKILL'), 3000);
  await exited;
  clearTimeout(timer);
}

try {
  health = await probe();
  if (!health) {
    ownedServer = spawn(process.execPath, [resolve(root, 'scripts/dev.mjs')], {
      cwd: root, env: process.env, stdio: ['ignore', 'pipe', 'pipe'],
    });
    ownedServer.on('error', error => { childOutput += redact(error.message); });
    for (const stream of [ownedServer.stdout, ownedServer.stderr]) {
      stream.on('data', chunk => { childOutput = (childOutput + redact(chunk)).slice(-24000); });
    }
    for (let attempt = 0; attempt < 40; attempt++) {
      await delay(100, undefined, { signal: abort.signal });
      if (ownedServer.exitCode !== null) throw new Error(`서버 시작 실패: ${childOutput}`);
      health = await probe();
      if (health) break;
    }
    if (!health || health.pid !== ownedServer.pid) throw new Error('점검용 서버 시작을 확인하지 못했습니다.');
  }
  report.server = { mode: ownedServer ? 'started' : 'reused', sessionId: health.sessionId };
  browser = await chromium.launch({ timeout: 15000 });
  for (const [name, width, height, mobile] of [
    ['mobile', 390, 844, true], ['desktop', 1440, 900, false],
  ]) {
    abort.signal.throwIfAborted();
    const screen = { name, viewport: { width, height }, status: 'PASS', issues: [], screenshot: null };
    report.screens.push(screen);
    const context = await browser.newContext({ viewport: screen.viewport,
      isMobile: mobile, hasTouch: mobile, deviceScaleFactor: 1 });
    const page = await context.newPage();
    const issue = (kind, message) => screen.issues.push({ kind, message: redact(message) });
    page.on('console', message => {
      if (['error', 'warning'].includes(message.type())) issue(`console.${message.type()}`, message.text());
    });
    page.on('pageerror', error => issue('pageerror', error.message));
    page.on('requestfailed', request => issue('requestfailed', `${request.url()} ${request.failure()?.errorText}`));
    page.on('response', response => {
      if (response.status() >= 400) issue('http', `${response.status()} ${response.url()}`);
    });
    try {
      await page.goto(baseURL, { waitUntil: 'load', timeout: 15000 });
      await page.evaluate(() => document.fonts.ready);
      await delay(500, undefined, { signal: abort.signal });
      screen.screenshot = `${name}.png`;
      await page.screenshot({ path: resolve(output, screen.screenshot), fullPage: true, timeout: 15000 });
    } catch (error) { issue('capture', error.message); }
    finally { await context.close(); }
    if (screen.issues.some(item => item.kind !== 'console.warning')) screen.status = 'FAIL';
  }
} catch (error) {
  report.status = 'BLOCKED';
  report.issues.push({ kind: 'environment', message: redact(error.message) });
} finally {
  try { await browser?.close(); await stopOwnedServer(); }
  catch (error) { report.status = 'FAIL'; report.issues.push({ kind: 'cleanup', message: redact(error.message) }); }
  try {
    const entries = (await readFile(logPath, 'utf8')).trim().split('\n').filter(Boolean).map(line => JSON.parse(line));
    const current = entries.filter(entry => entry.sessionId === health?.sessionId && entry.time >= startedAt);
    await writeFile(resolve(output, 'server.log'), current.map(entry => stringify(entry)).join('\n') + '\n');
    report.serverLog = { status: health ? 'PASS' : 'NOT_RUN', entries: current.length,
      requests: current.filter(entry => entry.kind === 'request').length,
      errors: current.filter(entry => entry.kind === 'error' || entry.status >= 400).length };
  } catch (error) {
    report.serverLog = { status: health ? 'FAIL' : 'NOT_RUN', entries: 0, errors: 0 };
    if (health) { report.status = 'FAIL'; report.issues.push({ kind: 'server.log', message: redact(error.message) }); }
  }
  if (report.screens.some(screen => screen.status === 'FAIL') || report.serverLog.errors > 0) report.status = 'FAIL';
  report.finishedAt = new Date().toISOString();
  const lines = [`UI check: ${report.status}`, `URL: ${baseURL}`, `Server: ${report.server?.mode ?? 'NOT_RUN'}`];
  for (const screen of report.screens) {
    lines.push(`${screen.name} ${screen.viewport.width}×${screen.viewport.height}: ${screen.status}; screenshot=${screen.screenshot ?? 'NOT_RUN'}; issues=${screen.issues.length}`);
    lines.push(...screen.issues.map(item => `  ${item.kind}: ${item.message}`));
  }
  lines.push(`Server log: ${report.serverLog.status}; entries=${report.serverLog.entries}; errors=${report.serverLog.errors}`);
  lines.push(...report.issues.map(item => `${item.kind}: ${item.message}`));
  lines.push('범위: 초기 페이지 로드만 점검. 기능 검증·실제 휴대폰 검증은 NOT_RUN.', `Artifacts: ${output}`);
  await writeFile(resolve(output, 'report.json'), stringify(report, 2) + '\n');
  await writeFile(resolve(output, 'summary.txt'), lines.join('\n') + '\n');
  console.log(lines.join('\n'));
  process.exitCode = report.status === 'PASS' ? 0 : report.status === 'BLOCKED' ? 2 : 1;
}
