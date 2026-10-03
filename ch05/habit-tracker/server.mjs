import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';

const types = { 'index.html': 'text/html; charset=utf-8', 'styles.css': 'text/css; charset=utf-8', 'theme.js': 'text/javascript; charset=utf-8', 'app.mjs': 'text/javascript; charset=utf-8', 'dates.mjs': 'text/javascript; charset=utf-8', 'model.mjs': 'text/javascript; charset=utf-8' };
const port = Number(process.env.PORT || 5173);
const server = createServer(async (req, res) => {
  const path = new URL(req.url, 'http://localhost').pathname;
  const file = path === '/' ? 'index.html' : path.slice(1);
  if (!Object.hasOwn(types, file) || !['GET', 'HEAD'].includes(req.method)) {
    res.writeHead(404); res.end('찾을 수 없는 페이지입니다.'); return;
  }
  try {
    const body = await readFile(new URL(file, import.meta.url));
    res.writeHead(200, { 'Content-Type': types[file], 'Cache-Control': 'no-store' });
    res.end(req.method === 'HEAD' ? undefined : body);
  } catch { res.writeHead(500); res.end('파일을 읽을 수 없습니다.'); }
});
server.on('error', error => { console.error(`서버 실행 실패: ${error.message}`); process.exitCode = 1; });
server.listen(port, '127.0.0.1', () => console.log(`습관 트래커: http://127.0.0.1:${port}`));
