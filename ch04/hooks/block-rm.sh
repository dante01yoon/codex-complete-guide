#!/bin/bash
# 셸 명령에 rm이 들어 있으면 실행을 막습니다.
cmd="$(jq -r '.tool_input.command // ""')"
if printf '%s' "$cmd" | grep -Eq '(^|[;&| ])rm( |$)'; then
  jq -n --arg r "rm으로 파일을 지우는 명령은 이 프로젝트에서 금지되어 있습니다. 파일을 지우지 말고 사용자에게 먼저 물어보세요." \
    '{hookSpecificOutput: {hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: $r}}'
fi
exit 0
