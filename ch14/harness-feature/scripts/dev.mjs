import { createServer } from 'node:http';
import { appendFileSync, mkdirSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createDemoReservations } from '../src/server/demo-reservations.mjs';

export const root = fileURLToPath(new URL('../', import.meta.url));
export const baseURL = 'http://127.0.0.1:4180';
export const logPath = new URL('../artifacts/server.log', import.meta.url);
export const identity = { app: 'ev-booking-ui', root };

export async function startDevServer() {
  const reservations = createDemoReservations();
  mkdirSync(new URL('../artifacts/', import.meta.url), { recursive: true });
  function log(message) {
    const line = `${new Date().toISOString()} ${message}`;
    appendFileSync(logPath, `${line}\n`);
    console.log(line);
  }
  // Only explicitly served UI files are accessible; source, .env and artifacts stay private.
  const server = createServer(async (request, response) => {
    let pathname = '/';
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.on('finish', () => log(`${request.method} ${pathname} ${response.statusCode}`));
    try {
      pathname = new URL(request.url, baseURL).pathname;
      const cancelRoute = /^\/api\/demo\/reservations\/(demo-(?:150|60|20))\/cancel$/.exec(pathname);
      if (request.method === 'POST' && cancelRoute) {
        if (request.headers['x-demo-action'] !== 'cancel'
          || (request.headers.origin && request.headers.origin !== baseURL)) {
          response.writeHead(403);
          response.end('Forbidden');
          return;
        }
        response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        response.end(JSON.stringify(reservations.cancel(cancelRoute[1])));
        return;
      }
      if (request.method !== 'GET' && request.method !== 'HEAD') {
        response.writeHead(405, { Allow: 'GET, HEAD' });
        response.end();
        return;
      }
      if (pathname === '/__ui_health') {
        response.writeHead(200, { 'Content-Type': 'application/json' });
        response.end(request.method === 'HEAD' ? undefined : JSON.stringify(identity));
      } else if (pathname === '/api/demo/reservations') {
        response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        response.end(request.method === 'HEAD' ? undefined : JSON.stringify(reservations.snapshot()));
      } else if (pathname === '/' || pathname === '/my-reservations') {
        const html = await readFile(new URL('../ui/index.html', import.meta.url));
        response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        response.end(request.method === 'HEAD' ? undefined : html);
      } else if (pathname === '/favicon.ico') {
        response.writeHead(204);
        response.end();
      } else {
        response.writeHead(404);
        response.end('Not found');
      }
    } catch (error) {
      log(`ERROR ${error.code ?? 'REQUEST_FAILED'}`);
      response.writeHead(500);
      response.end('Server error');
    }
  });
  server.requestTimeout = 10_000;
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(4180, '127.0.0.1', resolve);
  }).catch((error) => {
    log(`ERROR ${error.code ?? 'START_FAILED'}: ${baseURL} 서버를 시작하지 못했습니다.`);
    throw error;
  });
  log(`READY ${baseURL}`);
  server.on('close', () => log('STOPPED'));
  return server;
}

export async function stopDevServer(server) {
  await new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
    server.closeAllConnections();
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const server = await startDevServer();
    for (const signal of ['SIGINT', 'SIGTERM']) {
      process.once(signal, () => { void stopDevServer(server); });
    }
  } catch {
    process.exitCode = 1;
  }
}
