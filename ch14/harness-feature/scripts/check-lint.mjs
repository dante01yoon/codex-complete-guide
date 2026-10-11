// Tooling acceptance checks; existing product AC tests are read-only.
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { lintSource } from './ui-lint.mjs';

const cases = [
  ['Date.now', 'const x = Date.now();', 'EV001'],
  ['new Date', 'const x = new Date();', 'EV001'],
  ['Date function ignores arguments', 'const x = Date(serverNowMs);', 'EV001'],
  ['undefined Date', 'new Date(undefined);', 'EV001'],
  ['computed global clock', 'window["Date"]["now"]();', 'EV001'],
  ['global Date alias', 'const D = globalThis.Date; new D();', 'EV001'],
  ['clock alias', 'const f = Date.now; f();', 'EV001'],
  ['destructured clock', 'const { now: f } = Date; f();', 'EV001'],
  ['destructured global Date', 'const {Date: D} = window; new D();', 'EV001'],
  ['bound clock', 'const f = Date.now.bind(Date); f();', 'EV001'],
  ['call clock', 'Date.now.call(null);', 'EV001'],
  ['performance clock', 'performance.now();', 'EV001'],
  ['optional clock', 'globalThis.Date?.now?.();', 'EV001'],
  ['Temporal clock', 'Temporal.Now.instant();', 'EV001'],
  ['money', 'const x = payment.amount * 2;', 'EV002'],
  ['literal money result', 'const amount = 3000 / 2;', 'EV002'],
  ['literal money property', 'const result = {refundAmount: 3000 / 2};', 'EV002'],
  ['literal refund return', 'function refundAmount() { return 3000 / 2; }', 'EV002'],
  ['literal time result', 'const durationMs = 30 * 60 * 1000;', 'EV002'],
  ['literal Math result', 'const amount = Math.round(1500.5);', 'EV002'],
  ['money alias', 'const x = payment.amount; const y = x; y / 2;', 'EV002'],
  ['destructured money', 'const {amount: x} = payment; x / 2;', 'EV002'],
  ['reassigned money', 'let x; x = payment.amount; x / 2;', 'EV002'],
  ['function money', 'function read() { return payment.amount; } read() / 2;', 'EV002'],
  ['arrow money', 'const read = () => payment.amount; read() / 2;', 'EV002'],
  ['function expression money', 'const read = function() { return payment.amount; }; read() / 2;', 'EV002'],
  ['KRW money', 'const x = refundAmountKRW / 2;', 'EV002'],
  ['Korean money', 'const x = 예약금 / 2;', 'EV002'],
  ['time duration', 'const endMs = startMs + durationMinutes * 60000;', 'EV002'],
  ['time comparison', 'if (serverNowMs >= booking.deadlineMs) cancel();', 'EV002'],
  ['date values', 'const x = new Date(a); const y = new Date(b); x - y;', 'EV002'],
  ['Math round money', 'Math.round(payment.amount);', 'EV002'],
  ['Math alias', 'const round = Math.round; round(payment.amount);', 'EV002'],
  ['increment', 'refundAmount++;', 'EV002'],
  ['compound assignment', 'serverNowMs += 60000;', 'EV002'],
  ['unary number', 'const x = +payment.amount;', 'EV002'],
  ['date mutation', 'const x = new Date(serverNowMs); x.setMinutes(30);', 'EV002'],
  ['date library', 'import {addMinutes} from "date-fns";', 'EV003'],
  ['moment library', 'import moment from "moment";', 'EV003'],
  ['dynamic date library', 'const lib = await import("dayjs");', 'EV003'],
  ['require date library', 'const lib = require("luxon");', 'EV003'],
  ['bad syntax', 'const x = ;', 'EV000'],
  ['TSX money', 'const x: number = payment.amount / 2; const view = <p>{x}</p>;', 'EV002', 'src/ui/view.tsx'],
  ['HTML script', '<script>const x = Date.now();</script>', 'EV001', 'web/index.html'],
  ['HTML module', '<script type="module">const x = deposit / 2;</script>', 'EV002', 'web/index.html'],
  ['HTML handler', '<button onclick="Date.now()">go</button>', 'EV001', 'web/index.html'],
  ['HTML escaped handler', '<button onclick="payment.amount &gt; 0">go</button>', 'EV002', 'web/index.html'],
  ['HTML javascript URL', '<a href="javascript:Date.now()">go</a>', 'EV001', 'web/index.html'],
  ['HTML template', '<template><script>Date.now()</script></template>', 'EV001', 'web/index.html'],
];
const allowed = [
  ['server clock display', 'const x = new Date(serverNowMs); x.toLocaleString("ko-KR", {timeZone: "Asia/Seoul"});'],
  ['money display', 'payment.amount.toLocaleString("ko-KR") + "원";'],
  ['string display', '"예약금 " + deposit;'],
  ['template display', '`예약금 ${deposit}원`;'],
  ['rules calls', 'import {reduceUserCancellation} from "../rules/index.js"; reduceUserCancellation(input, serverNowMs);'],
  ['UI coordinates', 'const width = 100; const x = width / 2;'],
  ['comments and strings', '// Date.now()\nconst label = "new Date(); amount / 2";'],
  ['shadowed Date', 'function f(Date) { return Date.now(); }'],
  ['shadowed alias', 'const x = payment.amount; function f(x) { return x / 2; }'],
  ['JSON script', '<script type="application/json">{"text":"Date.now()"}</script>', 'web/index.html'],
  ['no HTML code', '<p>Date.now() amount / 2</p>', 'web/index.html'],
];
let count = 0;
for (const [name, source, ruleId, file = 'web/view.js'] of cases) {
  const found = lintSource(source, file);
  assert.ok(found.some(item => item.ruleId === ruleId), `${name}: expected ${ruleId}, received ${JSON.stringify(found)}`);
  for (const item of found) assert.ok(item.line > 0 && item.column > 0 && item.reason && item.fix && item.file === file);
  count++;
}
for (const [name, source, file = 'web/view.js'] of allowed) {
  assert.deepEqual(lintSource(source, file), [], name);
  count++;
}
assert.deepEqual(lintSource('const x = deposit / 2; const endMs = startMs + 60000;', 'src/rules/example.ts', {rules: true, client: false}), []);
assert.ok(lintSource('Date.now()', 'src/rules/example.ts', {rules: true}).some(item => item.ruleId === 'EV001'));
assert.deepEqual(lintSource('Date.now()', 'src/server/example.ts', {client: false}), []);
assert.ok(lintSource('payment.amount / 2', 'src/server/example.ts', {client: false}).some(item => item.ruleId === 'EV002'));
const html = '\n<p>demo</p>\n<script>\nDate.now();\n</script>';
assert.equal(lintSource(html, 'web/index.html')[0].line, 4);
assert.equal(lintSource(html, 'web/index.html')[0].column, 1);
count += 6;

const directory = await mkdtemp(resolve(tmpdir(), 'ev-ui-lint-'));
const cli = resolve(import.meta.dirname, 'lint-ui.mjs');
const run = (...args) => spawnSync(process.execPath, [cli, ...args], {encoding: 'utf8'});
try {
  const file = resolve(directory, 'example.js');
  await writeFile(file, 'Date.now(); const x = payment.amount / 2;');
  const failed = run('--json', file);
  assert.equal(failed.status, 1);
  const result = JSON.parse(failed.stdout);
  assert.equal(result.status, 'FAIL');
  assert.equal(result.checkedFiles, 1);
  assert.ok(result.diagnostics.some(item => item.ruleId === 'EV001'));
  assert.ok(result.diagnostics.some(item => item.ruleId === 'EV002'));
  const human = run(file);
  assert.equal(human.status, 1);
  assert.match(human.stderr, /example\.js:1:1 error EV001/);
  assert.match(human.stderr, /이유:/);
  assert.match(human.stderr, /수정:/);
  await writeFile(file, 'new Date(serverNowMs).toISOString();');
  const passed = run('--json', file);
  assert.equal(passed.status, 0);
  assert.equal(JSON.parse(passed.stdout).status, 'PASS');
  const blocked = run('--json', resolve(directory, 'missing'));
  assert.equal(blocked.status, 2);
  assert.equal(JSON.parse(blocked.stdout).status, 'BLOCKED');
  const unknown = run('--unknown');
  assert.equal(unknown.status, 2);
  count += 5;
} finally {
  await rm(directory, {recursive: true, force: true});
}
console.log(`PASS — 린트 검증 ${count}개 (위반·허용·위치·CLI 종료 코드/JSON)`);
