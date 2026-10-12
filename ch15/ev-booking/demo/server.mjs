import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { readLoops } from './records.mjs';

const port = Number(process.env.PORT || 5181);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT는 1~65535 정수여야 합니다.');
const files = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/index.html', ['index.html', 'text/html; charset=utf-8']],
  ['/styles.css', ['styles.css', 'text/css; charset=utf-8']],
  ['/app.js', ['app.js', 'text/javascript; charset=utf-8']],
]);
const server = http.createServer(async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'");
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { Allow: 'GET, HEAD' }); res.end(); return;
  }
  try {
    const pathname = new URL(req.url, 'http://127.0.0.1').pathname;
    if (pathname === '/favicon.ico') { res.writeHead(204); res.end(); return; }
    if (pathname === '/api/loops') {
      const data = await readLoops();
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(req.method === 'HEAD' ? undefined : JSON.stringify(data)); return;
    }
    const asset = files.get(pathname);
    if (!asset) { res.writeHead(404); res.end('Not found'); return; }
    const content = await readFile(new URL(asset[0], import.meta.url));
    res.writeHead(200, { 'Content-Type': asset[1] });
    res.end(req.method === 'HEAD' ? undefined : content);
  } catch {
    res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: '기록을 읽지 못했습니다. 폴더와 JSON 파일을 확인해 주세요.' }));
  }
});
server.on('error', error => {
  console.error(error.code === 'EADDRINUSE' ? `포트 ${port} 사용 중. PORT를 지정해 다시 실행하세요.` : `서버 실행 실패: ${error.code || 'UNKNOWN'}`);
  process.exitCode = 1;
});
server.listen(port, '127.0.0.1', () => console.log(`루프 기록 화면: http://127.0.0.1:${port}`));
