#!/bin/bash
# 사용법: scripts/loop-min.sh "작업 설명"  (테스트가 통과할 때까지 최대 3바퀴)
for round in 1 2 3; do
  if npx vitest run > test.log 2>&1; then
    echo "[$round바퀴] 테스트 모두 통과: $(grep -E ' Tests ' test.log)"; exit 0
  fi
  failed=$(grep -E 'FAIL|Error:' test.log | head -10)
  echo "[$round바퀴] 실패 → 코덱스에게 넘깁니다"; echo "$failed" | sed 's/^/    /'
  codex exec -s workspace-write "$1
지금 실패하는 테스트와 오류:
$failed
테스트 파일은 고치지 말고 구현을 고쳐 줘." < /dev/null > codex-$round.log 2>&1
done
echo "3바퀴 안에 통과하지 못해 멈춥니다"; exit 1
