#!/usr/bin/env bash
# PreToolUse / UserPromptSubmit: JSON on stdin; raw command/patch also supported.
# Exit 0 = allow, 2 = block. Never execute or echo the submitted input.
set -euo pipefail
export EV_GUARD_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)"
exec node --input-type=commonjs -e '
const fs = require("node:fs");
const path = require("node:path");
const root = process.env.EV_GUARD_ROOT;
// The user owns this switch. Directories and symlinks cannot enable writing.
let testWriting = false;
try { testWriting = fs.lstatSync(path.join(root, ".codex", "TEST_WRITING")).isFile(); }
catch { /* Missing switch keeps tests read-only. */ }
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
function protectedKind(value, base = cwd) {
  if (typeof value !== "string") return null;
  const clean = value.replace(/^["\x27]|["\x27]$/g, "");
  const absolute = path.resolve(base, clean);
  const tests = path.join(root, "tests");
  const controls = path.join(root, ".codex");
  function classify(candidate) {
    // Protect the control directory and its ancestors from recursive removal/move.
    if (candidate === controls || candidate.startsWith(controls + path.sep)
        || controls.startsWith(candidate.endsWith(path.sep) ? candidate : candidate + path.sep)) return "control";
    if (candidate === tests || candidate.startsWith(tests + path.sep)) return "test";
    return null;
  }
  const direct = classify(absolute);
  if (direct) return direct;
  // Resolve existing parents as well as symlinked files/directories.
  let existing = absolute;
  while (!fs.existsSync(existing) && path.dirname(existing) !== existing) existing = path.dirname(existing);
  try {
    const real = path.resolve(fs.realpathSync(existing), path.relative(existing, absolute));
    return classify(real);
  } catch { return null; }
}
function protectWrite(value, base = cwd) {
  const kind = protectedKind(value, base);
  if (kind === "control") block(".codex/ 스위치·훅·설정은 사용자만 변경할 수 있습니다.");
  if (kind === "test" && !testWriting) block("tests/ 수정에는 사용자가 만든 .codex/TEST_WRITING 파일이 필요합니다.");
}
const name = String(event.tool_name || "");
const input = event.tool_input ?? event;
function strings(value) {
  if (typeof value === "string") return [value];
  if (!value || typeof value !== "object") return [];
  return Object.values(value).flatMap(strings);
}
function patch(text, base = cwd) {
  // Check only file headers, not source lines mentioning tests/.
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^\*\*\* (?:Add File|Update File|Delete File|Move to):\s*(.+)$/)
      || line.match(/^(?:---|\+\+\+)\s+(?:[ab]\/)?([^\t]+)(?:\t.*)?$/)
      || line.match(/^diff --git [ab]\/(\S+) [ab]\/(\S+)$/);
    if (match) match.slice(1).forEach(value => protectWrite(value, base));
  }
}
function command(text, workdir = cwd) {
  patch(text, workdir);
  const simple = text.trim();
  const testRunner = /\b(?:test:rules|vitest)\b/.test(simple);
  if (testRunner && !testWriting && /(?:^|\s)(?:-u|--update)(?:[=\s]|$)/.test(simple)) {
    block("tests/ 스냅샷 갱신에는 사용자 TEST_WRITING 스위치가 필요합니다.");
  }
  // Conservative token scan; resolve aliases and paths relative to command workdir.
  const tokens = text.match(/[^\s;|&<>()"\x27`]+/g) || [];
  const kinds = tokens.map(token => protectedKind(token, workdir));
  const controlsTouched = /(?:\.codex(?:[/\\\s"\x27;|&]|$)|\bTEST_WRITING\b)/m.test(text)
    || kinds.includes("control");
  const testsTouched = /(^|[\s/"\x27=])tests(?:[/\s"\x27;|&]|$)/m.test(text)
    || kinds.includes("test");
  if (!controlsTouched && (!testsTouched || testWriting)) return;
  // Only uncomplicated read/run commands qualify. Reject redirections, chaining,
  // substitutions, and options that can run a preprocessor or write an output file.
  if (/[;|&<>`\n\r]/.test(text) || /\$[({]/.test(text)) block("보호 경로를 참조하는 복합 셸 명령은 허용하지 않습니다.");
  const read = /^(?:cat|head|tail|ls|wc)\s/.test(simple)
    || (/^rg\s/.test(simple) && !/--(?:pre|hostname-bin)(?:[=\s]|$)/.test(simple))
    || (/^git\s+(?:diff|status|show|ls-files)\b/.test(simple) && !/--(?:output|ext-diff|textconv|no-index)(?:[=\s]|$)/.test(simple))
    || /^npm\s+run\s+(?:test:rules|typecheck)(?:\s|$)/.test(simple)
    || /^(?:npx\s+)?vitest\s+run\b/.test(simple);
  if (!read) block(controlsTouched
    ? ".codex/ 스위치·훅·설정을 변경할 가능성이 있는 명령은 금지됩니다."
    : "tests/ 수정에는 사용자 TEST_WRITING 스위치가 필요합니다.");
}
if (/patch/i.test(name)) {
  strings(input).forEach(text => patch(text));
} else if (/^(?:Read|read_file)$|__read(?:_file)?$/i.test(name)) {
  // Read tools may inspect tests; the key scan above still applies.
} else {
  function inspect(value) {
    if (typeof value === "string") { command(value); return; }
    if (!value || typeof value !== "object") return;
    for (const [key, val] of Object.entries(value)) {
      if (/^(?:file_?path|path|destination|target|source|output_?path|old_?path|new_?path)$/i.test(key)) {
        protectWrite(val, value.workdir || cwd);
      }
      if (/^(?:cmd|command|code|script)$/i.test(key) && typeof val === "string") {
        command(val, value.workdir || cwd);
      } else if (/^(?:patch|input)$/i.test(key) && typeof val === "string" && val.includes("*** Begin Patch")) {
        patch(val);
      } else if (val && typeof val === "object") inspect(val);
    }
  }
  inspect(input);
}
'
