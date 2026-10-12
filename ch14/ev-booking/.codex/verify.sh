#!/usr/bin/env bash
# Stop hook: pass its JSON on stdin. Runs both checks even when one fails.
# First failure: exit 2 asks for ONE repair. Continued Stop failure: JSON stops
# the loop and reports FAIL; exit 0 here is the hook protocol, not a test PASS.
# Manual: .codex/verify.sh </dev/null; after fixing use --retry (FAIL exits 1).
set -euo pipefail
export EV_VERIFY_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)"
exec node --input-type=commonjs -e '
const fs = require("node:fs");
const { spawnSync } = require("node:child_process");
const args = process.argv.slice(1);
if (args.some(arg => arg !== "--retry")) {
  console.error("Usage: verify.sh [--retry]"); process.exit(1);
}
const raw = process.stdin.isTTY ? "" : fs.readFileSync(0, "utf8");
let event = null;
if (raw.trim()) {
  try { event = JSON.parse(raw); }
  catch { console.error("verify: BLOCKED — 잘못된 훅 JSON입니다."); process.exit(2); }
  if (!event || typeof event !== "object" || Array.isArray(event)
      || event.hook_event_name !== "Stop" || typeof event.stop_hook_active !== "boolean") {
    console.error("verify: BLOCKED — Stop 이벤트와 stop_hook_active 불리언이 필요합니다.");
    process.exit(2);
  }
}
const retry = event ? event.stop_hook_active : args.includes("--retry");
const results = [];
for (const script of ["test:rules", "typecheck"]) {
  console.error(`verify: RUN npm run ${script}`);
  const result = spawnSync("npm", ["run", script], {
    cwd: process.env.EV_VERIFY_ROOT,
    // Keep stdout reserved for the Stop JSON. Inherit stderr for live feedback.
    stdio: ["ignore", 2, 2],
    timeout: 120000,
  });
  const passed = !result.error && result.status === 0;
  results.push({ script, passed });
  console.error(`verify: ${passed ? "PASS" : "FAIL"} ${script}`);
}
const failed = results.filter(result => !result.passed).map(result => result.script);
if (!failed.length) {
  if (event) console.log(JSON.stringify({ systemMessage: "verify: PASS — 테스트·타입 검사 모두 통과했습니다." }));
  process.exit(0);
}
const summary = `verify: FAIL — ${failed.join(", ")}`;
if (!retry) {
  console.error(`${summary}. tests/ 는 변경하지 말고 구현을 한 번만 수정하세요. 수정 후 재검증하고, 다시 실패하면 추가 자동 수정 없이 실패를 보고하세요.`);
  process.exit(2);
}
const reason = `${summary}. 한 번의 수정 기회를 사용했습니다. 추가 자동 수정을 중단합니다. 검사 실패로 작업 완료를 주장할 수 없습니다.`;
console.error(reason);
if (event) {
  console.log(JSON.stringify({ continue: false, stopReason: reason, systemMessage: reason }));
  process.exit(0);
}
process.exit(1);
' -- "$@"
