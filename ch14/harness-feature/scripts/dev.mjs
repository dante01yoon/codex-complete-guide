import { createServer } from 'node:http';
import { mkdir, readFile, realpath, appendFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { randomUUID } from 'node:crypto';
import { root, artifactRoot, logPath, host, port, baseURL, stringify } from './ui-config.mjs';
import { createReservationsDemo } from '../src/server/reservations.ts';
import { loadDemoReservations } from '../src/server/demo-data.ts';

const webRoot = await realpath(resolve(root, 'web'));
const sessionId = randomUUID();
const reservations = createReservationsDemo(await loadDemoReservations());
await mkdir(artifactRoot, { recursive: true });
let logQueue = Promise.resolve();
function log(entry) {
  const line = stringify({ time: new Date().toISOString(), sessionId, ...entry });
  console.log(line);
  logQueue = logQueue.then(() => appendFile(logPath, `${line}\n`, { mode: 0o600 }))
    .catch(() => { console.error('서버 로그 저장 실패'); process.exitCode = 1; });
}
const contentTypes = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.json': 'application/json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp' };

const server = createServer(async (request, response) => {
  let pathname = '';
  response.on('finish', () => log({ kind: 'request', method: request.method,
    path: pathname, status: response.statusCode }));
  response.setHeader('Cache-Control', 'no-store');
  try {
    pathname = decodeURIComponent(new URL(request.url, baseURL).pathname);
    if (pathname === '/api/reservations' && request.method === 'GET') {
      response.setHeader('Content-Type', 'application/json; charset=utf-8');
      response.end(JSON.stringify(reservations.list())); return;
    }
    const cancellation = pathname.match(/^\/api\/reservations\/([^/]+)\/cancel$/);
    if (cancellation && request.method === 'POST') {
      response.setHeader('Content-Type', 'application/json; charset=utf-8');
      if (request.headers.origin !== baseURL || request.headers['x-demo-request'] !== 'cancel') {
        response.writeHead(403); response.end(JSON.stringify({ message: '화면의 취소 확인창에서 요청해 주세요.' })); return;
      }
      const result = reservations.cancel(cancellation[1]);
      if (!result) { response.writeHead(404); response.end(JSON.stringify({ message: '시연 예약을 찾을 수 없습니다.' })); return; }
      response.end(JSON.stringify(result)); return;
    }
    if (!['GET', 'HEAD'].includes(request.method)) {
      response.writeHead(405, { Allow: 'GET, HEAD' }); response.end(); return;
    }
    if (pathname === '/__ui_health') {
      response.setHeader('Content-Type', 'application/json');
      response.end(request.method === 'HEAD' ? undefined : JSON.stringify({
        service: 'ev-booking-ui', root, sessionId, pid: process.pid,
      })); return;
    }
    const candidate = resolve(webRoot, `.${pathname === '/' ? '/index.html' : pathname}`);
    if (!candidate.startsWith(webRoot + sep)) {
      response.writeHead(403); response.end(); return;
    }
    const file = await realpath(candidate);
    if (!file.startsWith(webRoot + sep)) {
      response.writeHead(403); response.end(); return;
    }
    const body = await readFile(file);
    response.setHeader('Content-Type', contentTypes[extname(file)] ?? 'application/octet-stream');
    response.end(request.method === 'HEAD' ? undefined : body);
  } catch (error) {
    const status = ['ENOENT', 'ENOTDIR', 'EISDIR'].includes(error.code) ? 404
      : error instanceof URIError ? 400 : 500;
    response.writeHead(status); response.end();
    if (status === 500) log({ kind: 'error', message: error.message });
  }
});
server.on('error', async error => {
  log({ kind: 'error', code: error.code, message: error.message });
  await logQueue; process.exitCode = 1;
});
server.listen(port, host, () => log({ kind: 'start', url: baseURL, pid: process.pid }));
let stopping = false;
async function stop() {
  if (stopping) return;
  stopping = true;
  server.closeAllConnections();
  await new Promise(resolveClose => server.close(resolveClose));
  log({ kind: 'stop' });
  await logQueue;
}
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
