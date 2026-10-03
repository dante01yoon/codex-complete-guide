#!/bin/bash
# [실습 03] PR 사전 검사 실습 저장소를 만듭니다.
# 사용법: bash setup.sh ~/Documents/pr-check-practice
set -e
SRC="$(cd "$(dirname "$0")" && pwd)"
DEST="${1:-$HOME/Documents/pr-check-practice}"
mkdir -p "$DEST" && cd "$DEST"
git init -q -b main
cp -R "$SRC/main/." .
git add -A && git commit -qm "틱택토 판정 로직과 테스트"
git switch -qc feature/scoreboard
cp -R "$SRC/feature/." .
git add -A && git commit -qm "점수판 기능 추가"
echo "준비 완료: $DEST (현재 브랜치 feature/scoreboard)"
