#!/bin/bash
set -euo pipefail
command -v jq >/dev/null || { printf 'jq가 없어 종료 검증을 수행할 수 없습니다.\n' >&2; exit 2; }
block() { jq -n --arg reason "$1" '{decision:"block",reason:$reason}'; exit 0; }
payload=$(cat)
if ! printf '%s' "$payload" | jq -e 'type == "object"' >/dev/null 2>&1; then
  block 'Stop 훅 입력이 올바른 JSON 객체가 아닙니다. 입력을 확인하세요.'
fi
if printf '%s' "$payload" | jq -e '.stop_hook_active == true' >/dev/null; then
  printf '{}\n'
  exit 0
fi
project_root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)
cd -- "$project_root"
command -v npx >/dev/null || block 'npx가 없어 테스트와 타입 검사를 실행하지 못했습니다.'
# 의존성이 없을 때 npx가 패키지를 임의로 내려받지 않도록 한다.
[[ -x node_modules/.bin/vitest && -x node_modules/.bin/tsc ]] || block '로컬 Vitest 또는 TypeScript가 없어 검증하지 못했습니다. 프로젝트 의존성을 확인하세요.'
check_dir=$(mktemp -d "${TMPDIR:-/tmp}/ev-booking-verify.XXXXXX")
trap 'rm -rf -- "$check_dir"' EXIT
vitest_status=0
tsc_status=0
npx vitest run --reporter=json --outputFile="$check_dir/vitest.json" >"$check_dir/vitest.log" 2>&1 || vitest_status=$?
npx tsc --noEmit >"$check_dir/tsc.log" 2>&1 || tsc_status=$?
reason=''
if [[ $vitest_status -ne 0 ]]; then
  failed=$(jq -r '[.testResults[]? | .assertionResults[]? | select(.status == "failed") | (.fullName // .title)] | join("\n")' "$check_dir/vitest.json" 2>/dev/null || true)
  if [[ -z "$failed" ]]; then
    failed=$(jq -r '[.testResults[]? | select(.status == "failed") | .name] | join("\n")' "$check_dir/vitest.json" 2>/dev/null || true)
  fi
  if [[ -z "$failed" ]]; then
    failed="실패한 테스트 이름을 얻지 못했습니다. 실행/수집 오류를 확인하세요."
    failed="$failed"$'\n'"$(tail -n 12 "$check_dir/vitest.log")"
  fi
  reason="Vitest 실패 (종료 코드 $vitest_status). 실패한 테스트:"$'\n'"$failed"
fi
if [[ $tsc_status -ne 0 ]]; then
  reason="${reason:+$reason$'\n\n'}TypeScript 타입 검사 실패 (종료 코드 $tsc_status):"$'\n'"$(head -n 20 "$check_dir/tsc.log")"
fi
if [[ -n "$reason" ]]; then
  # 진단에 키가 섞여 있더라도 값은 돌려주지 않는다.
  reason=$(printf '%s' "$reason" | jq -Rs 'gsub("(live|test)_(gsk|gck|sk|ck)_[A-Za-z0-9_-]*"; "[결제 키 숨김]") | .[0:12000]' | jq -r .)
  block "$reason"$'\n\n'"tests/는 변경하지 말고 구현을 수정한 뒤 검증하세요."
fi
printf '{}\n'
