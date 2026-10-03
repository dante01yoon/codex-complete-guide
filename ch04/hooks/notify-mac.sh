#!/bin/bash
# 코덱스가 응답을 마치면(Stop) macOS 알림을 띄웁니다.
payload="$(cat)"
msg="$(printf '%s' "$payload" | jq -r '.last_assistant_message // "작업을 마쳤습니다"' | head -c 200)"
dir="$(printf '%s' "$payload" | jq -r '.cwd | split("/") | last')"
/usr/bin/osascript - "$msg" "Codex · $dir" >/dev/null 2>&1 <<'EOF'
on run argv
  display notification (item 1 of argv) with title (item 2 of argv) sound name "Glass"
end run
EOF
exit 0
