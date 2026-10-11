import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { refunds, runTests, testChanges } from './inspect.mjs';

// Resolve beside demo, independently of the shell's current directory.
const root = fileURLToPath(new URL('../', import.meta.url));
const value = process.env.PORT ?? '4174';
if (!/^\d+$/.test(value) || Number(value) < 1 || Number(value) > 65535) {
  console.error('PORT는 1~65535 사이의 정수여야 합니다.');
  process.exit(1);
}
const port = Number(value);
const html = await readFile(new URL('./index.html', import.meta.url));
console.log('기존 테스트를 실행합니다…');
const tests = await runTests(root);
console.log(`테스트 ${tests.status}: 통과 ${tests.passed ?? '확인 불가'}, 실패 ${tests.failed ?? '확인 불가'}`);

const server = createServer(async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  try {
    const path = new URL(req.url, 'http://127.0.0.1').pathname;
    if (req.method !== 'GET') { res.writeHead(405); res.end(); return; }
    if (path === '/api/status') {
      const [refund, changes] = await Promise.all([refunds(root), testChanges(root)]);
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ project: root, refund, tests, changes }));
    } else if (path === '/') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(html);
    } else if (path === '/favicon.ico') {
      res.writeHead(204); res.end();
    } else { res.writeHead(404); res.end('Not found'); }
  } catch { res.writeHead(500); res.end('확인 데이터를 가져오지 못했습니다.'); }
});
server.on('error', (error) => {
  console.error(error.code === 'EADDRINUSE' ? `포트 ${port}가 사용 중입니다. PORT를 바꿔 실행하세요.` : `서버 시작 실패: ${error.code ?? 'UNKNOWN'}`);
  process.exitCode = 1;
});
server.listen(port, '127.0.0.1', () => console.log(`하네스 확인 화면: http://127.0.0.1:${port}`));
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close());
