import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';
import { loadData } from './data.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');
const port = Number(process.env.GRAPH_VIEW_PORT || 5186);
const assets = new Map([['/', ['index.html', 'text/html']], ['/app.js', ['app.js', 'text/javascript']], ['/style.css', ['style.css', 'text/css']], ['/refinements.css', ['refinements.css', 'text/css']]]);
const allowedDocs = new Set(['agents.md', 'acceptance.md', 'mcp-booking-validation.md', 'mcp-server-validation.md', 'payment-test-review.md', 'payment-demo.md']);
const escape = text => text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');

createServer(async (request, response) => {
  try {
    const url = new URL(request.url, 'http://127.0.0.1');
    if (request.method !== 'GET') { response.writeHead(405); response.end('GET only'); return; }
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; object-src 'none'; base-uri 'none'");
    if (url.pathname === '/api/graph') {
      response.setHeader('Content-Type', 'application/json; charset=utf-8');
      response.end(JSON.stringify(await loadData(root))); return;
    }
    if (url.pathname.startsWith('/docs/')) {
      const file = url.pathname.slice(6);
      if (!allowedDocs.has(file)) { response.writeHead(404); response.end('Not found'); return; }
      const text = await readFile(resolve(root, 'docs', file), 'utf8');
      response.setHeader('Content-Type', 'text/html; charset=utf-8');
      response.end(`<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(file)} · 원본 근거</title><link rel="stylesheet" href="/style.css"><link rel="stylesheet" href="/refinements.css"><main class="source-document"><a href="/">← 작업 기록 화면</a><h1>docs/${escape(file)}</h1><p>현재 원본 · 줄 번호로 근거 확인</p>${text.split('\n').map((line,i) => `<div class="source-line" id="L${i+1}"><a href="#L${i+1}">${i+1}</a><pre>${escape(line) || ' '}</pre></div>`).join('')}</main></html>`); return;
    }
    const asset = assets.get(url.pathname);
    if (!asset) { response.writeHead(404); response.end('Not found'); return; }
    response.setHeader('Content-Type', `${asset[1]}; charset=utf-8`);
    response.end(await readFile(resolve(here, 'public', asset[0])));
  } catch {
    response.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
    response.end(JSON.stringify({ error: '문서 또는 그래프를 읽을 수 없습니다. docs의 원본 형식을 확인해 주세요.' }));
  }
}).listen(port, '127.0.0.1', () => console.log(`Agent work viewer: http://127.0.0.1:${port}`));
