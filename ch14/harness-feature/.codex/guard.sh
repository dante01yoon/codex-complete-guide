#!/usr/bin/env bash
# PreToolUse / UserPromptSubmit: JSON on stdin; raw command/patch also supported.
# Exit 0 = allow, 2 = block. Never execute or echo the submitted input.
set -euo pipefail
export EV_GUARD_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)"
exec node --input-type=commonjs -e '
const fs = require("node:fs");
const path = require("node:path");
const root = process.env.EV_GUARD_ROOT;
const raw = fs.readFileSync(0, "utf8");
function block(reason) {
  console.error(`guard: BLOCKED — ${reason}`);
  process.exit(2);
}
if (!raw.trim()) block("빈 입력은 검사할 수 없습니다.");
let event;
try { event = JSON.parse(raw); }
catch {
  if (/^\s*[\[{]/.test(raw)) block("잘못된 JSON 입력입니다.");
  event = { tool_input: { command: raw } };
}
if (typeof event === "string") event = { tool_input: { command: event } };
if (!event || typeof event !== "object" || Array.isArray(event)) block("지원하지 않는 입력 형식입니다.");
// Scan decoded JSON too, so Unicode-escaped key prefixes cannot bypass the guard.
if (raw.includes("live_") || JSON.stringify(event).includes("live_")) {
  block("실제 결제 키 접두사가 포함됐습니다. 테스트 키만 사용하세요.");
}
const cwd = typeof event.cwd === "string" ? event.cwd : root;
function protectedPath(value) {
  if (typeof value !== "string") return false;
  const clean = value.replace(/^["\x27]|["\x27]$/g, "");
  const absolute = path.resolve(cwd, clean);
  const tests = path.join(root, "tests");
  if (absolute === tests || absolute.startsWith(tests + path.sep)) return true;
  // Resolve existing parents as well as symlinked files/directories.
  let existing = absolute;
  while (!fs.existsSync(existing) && path.dirname(existing) !== existing) existing = path.dirname(existing);
  try {
    const real = fs.realpathSync(existing);
    return real === tests || real.startsWith(tests + path.sep);
  } catch { return false; }
}
const name = String(event.tool_name || "");
const input = event.tool_input ?? event;
function strings(value) {
  if (typeof value === "string") return [value];
  if (!value || typeof value !== "object") return [];
  return Object.values(value).flatMap(strings);
}
function patch(text) {
  // Check only file headers, not source lines mentioning tests/.
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^\*\*\* (?:Add File|Update File|Delete File|Move to):\s*(.+)$/)
      || line.match(/^(?:---|\+\+\+)\s+(?:[ab]\/)?([^\t]+)(?:\t.*)?$/)
      || line.match(/^diff --git [ab]\/(\S+) [ab]\/(\S+)$/);
    if (match && match.slice(1).some(protectedPath)) block("tests/ 파일의 추가·수정·삭제·이동 패치는 금지됩니다.");
  }
}
function command(text, workdir = cwd) {
  patch(text);
  const simple = text.trim();
  const testRunner = /\b(?:test:rules|vitest)\b/.test(simple);
  if (testRunner && /(?:^|\s)(?:-u|--update)(?:[=\s]|$)/.test(simple)) {
    block("tests/ 스냅샷 갱신은 금지됩니다.");
  }
  // Conservative token scan; resolve aliases and paths relative to command workdir.
  const tokens = text.match(/[^\s;|&<>()"\x27`]+/g) || [];
  const touches = /(^|[\s/"\x27=])tests(?:[/\s"\x27;|&]|$)/m.test(text)
    || tokens.some(token => protectedPath(path.resolve(workdir, token)));
  if (!touches) return;
  // Only uncomplicated read/run commands qualify. Reject redirections, chaining,
  // substitutions, and options that can run a preprocessor or write an output file.
  if (/[;|&<>`\n\r]/.test(text) || /\$[({]/.test(text)) block("tests/ 를 참조하는 복합 셸 명령은 허용하지 않습니다.");
  const read = /^(?:cat|head|tail|ls|wc)\s/.test(simple)
    || (/^rg\s/.test(simple) && !/--(?:pre|hostname-bin)(?:[=\s]|$)/.test(simple))
    || (/^git\s+(?:diff|status|show|ls-files)\b/.test(simple) && !/--(?:output|ext-diff|textconv|no-index)(?:[=\s]|$)/.test(simple))
    || /^npm\s+run\s+(?:test:rules|typecheck)(?:\s|$)/.test(simple)
    || /^(?:npx\s+)?vitest\s+run\b/.test(simple);
  if (!read) block("tests/ 를 변경할 가능성이 있는 명령은 금지됩니다. 테스트 대신 구현을 수정하세요.");
}
if (/patch/i.test(name)) {
  strings(input).forEach(patch);
} else if (/^(?:Read|read_file)$|__read(?:_file)?$/i.test(name)) {
  // Read tools may inspect tests; the key scan above still applies.
} else {
  function inspect(value) {
    if (typeof value === "string") { command(value); return; }
    if (!value || typeof value !== "object") return;
    for (const [key, val] of Object.entries(value)) {
      if (/^(?:file_path|path|destination|target|source)$/i.test(key) && protectedPath(val)) {
        block("tests/ 파일의 쓰기·이동은 허용하지 않습니다.");
      }
      if (/^(?:cmd|command)$/i.test(key) && typeof val === "string") {
        command(val, value.workdir || cwd);
      } else if (/^(?:patch|input)$/i.test(key) && typeof val === "string" && val.includes("*** Begin Patch")) {
        patch(val);
      } else if (val && typeof val === "object") inspect(val);
    }
  }
  inspect(input);
}
'
