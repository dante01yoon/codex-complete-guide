import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { baseURL, identity, logPath, startDevServer, stopDevServer } from './dev.mjs';

const output = new URL('../artifacts/ui/', import.meta.url);
const viewports = [
  { name: 'mobile', width: 390, height: 844, isMobile: true, hasTouch: true },
  { name: 'desktop', width: 1280, height: 900, isMobile: false, hasTouch: false },
];
const report = { url: baseURL, status: 'NOT_RUN', server: null, screens: [], errors: [], serverLogTail: [] };
let server;
let browser;

try {
  await mkdir(output, { recursive: true });
  const screens = JSON.parse(await readFile(new URL('./ui-pages.json', import.meta.url), 'utf8'));
  if (!screens.length) throw new Error('주요 화면 목록이 비어 있습니다.');
  const names = new Set();
  for (const screen of screens) {
    if (!/^[a-z0-9-]+$/.test(screen.name) || names.has(screen.name) ||
        !screen.path?.startsWith('/') || new URL(screen.path, baseURL).origin !== baseURL ||
        !screen.title || !screen.readySelector) {
      throw new Error('ui-pages.json의 이름·로컬 경로·제목·준비 선택자를 확인하세요.');
    }
    names.add(screen.name);
    for (const viewport of viewports) {
      await rm(new URL(`${screen.name}-${viewport.name}.png`, output), { force: true });
    }
  }
  let health;
  try {
    const response = await fetch(`${baseURL}/__ui_health`, { signal: AbortSignal.timeout(1000) });
    if (response.ok) health = await response.json();
  } catch { /* No matching running server: try binding the exact requested port. */ }
  if (health?.app === identity.app && health?.root === identity.root) {
    report.server = 'reused';
  } else {
    server = await startDevServer();
    report.server = 'started';
  }
  browser = await chromium.launch();
  for (const screen of screens) {
    for (const { name, width, height, isMobile, hasTouch } of viewports) {
      const result = { screen: screen.name, path: screen.path, viewport: { name, width, height }, status: 'NOT_RUN', errors: [] };
      report.screens.push(result);
      const context = await browser.newContext({ viewport: { width, height }, isMobile, hasTouch, deviceScaleFactor: 1 });
      try {
        const page = await context.newPage();
        page.on('console', (message) => {
          if (message.type() === 'error') result.errors.push(`console: ${message.text()}`);
        });
        page.on('pageerror', (error) => result.errors.push(`pageerror: ${error.message}`));
        page.on('requestfailed', (request) => result.errors.push(`requestfailed: ${request.url()} ${request.failure()?.errorText}`));
        page.on('response', (response) => {
          if (response.status() >= 400) result.errors.push(`HTTP ${response.status()}: ${response.url()}`);
        });
        const response = await page.goto(new URL(screen.path, baseURL).href, { waitUntil: 'networkidle', timeout: 15_000 });
        if (!response?.ok()) throw new Error(`화면 응답 실패: ${response?.status() ?? '없음'}`);
        result.title = await page.title();
        if (result.title !== screen.title) result.errors.push(`제목 불일치: ${result.title}`);
        await page.locator(screen.readySelector).waitFor({ state: 'visible', timeout: 5000 });
        await page.evaluate(() => document.fonts.ready);
        result.screenshot = `artifacts/ui/${screen.name}-${name}.png`;
        await page.screenshot({ path: fileURLToPath(new URL(`${screen.name}-${name}.png`, output)), fullPage: false, animations: 'disabled' });
        result.status = result.errors.length ? 'FAIL' : 'PASS';
      } catch (error) {
        result.errors.push(error.message);
        result.status = 'FAIL';
      } finally {
        await context.close();
      }
    }
  }
} catch (error) {
  report.errors.push(error.message);
} finally {
  try { await browser?.close(); } catch (error) { report.errors.push(error.message); }
  try { if (server) await stopDevServer(server); } catch (error) { report.errors.push(error.message); }
  try {
    report.serverLogTail = (await readFile(logPath, 'utf8')).trimEnd().split('\n').slice(-30);
  } catch (error) {
    report.errors.push(`서버 로그 읽기 실패: ${error.code}`);
  }
  report.status = report.errors.length || !report.screens.length || report.screens.some((screen) => screen.status !== 'PASS') ? 'FAIL' : 'PASS';
  await mkdir(output, { recursive: true });
  await writeFile(new URL('report.json', output), `${JSON.stringify(report, null, 2)}\n`);
  console.log(`\nUI ${report.status} — ${baseURL} (server: ${report.server ?? '시작 실패'})`);
  for (const screen of report.screens) {
    console.log(`${screen.status} ${screen.path} ${screen.viewport.name} ${screen.viewport.width}x${screen.viewport.height} → ${screen.screenshot ?? '스크린샷 없음'}`);
    for (const error of screen.errors) console.log(`  ${error}`);
  }
  for (const error of report.errors) console.log(`ERROR ${error}`);
  console.log(`브라우저 오류: ${report.screens.reduce((sum, screen) => sum + screen.errors.length, 0)}건`);
  console.log('\n서버 로그 마지막 30줄 (artifacts/server.log):');
  console.log(report.serverLogTail.join('\n') || '(로그 없음)');
  console.log('\n상세 요약: artifacts/ui/report.json');
  process.exitCode = report.status === 'PASS' ? 0 : 1;
}
