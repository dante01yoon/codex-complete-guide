#!/bin/bash
# 사용법: scripts/compare.sh ../best-demo-a ../best-demo-b
echo "후보   테스트                 바뀐 줄    환불 규칙"
for wt in "$@"; do
  name=$(basename "$wt")
  tests=$(cd "$wt" && npx vitest run 2>&1 | grep -E ' Tests ' | sed 's/ *Tests *//')
  lines=$(cd "$wt" && git add -N . && git diff --numstat main -- src | awk '{s+=$1+$2} END {print s+0}')
  if grep -qs "from './refund" "$wt/src/rules/notice.ts"; then rule="refund.ts의 함수 재사용"; else rule="직접 계산"; fi
  printf '%-6s %-22s %-10s %s\n' "${name##*-}" "$tests" "$lines" "$rule"
done
