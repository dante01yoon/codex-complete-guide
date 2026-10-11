#!/bin/bash
# 14장 '하네스 효과를 화면으로 확인하기' 실습 준비
# usage: bash ch14/setup-harness-demo.sh [만들 폴더]   (기본값: ~/harness-demo)
# 하네스 있음(harness-on)과 하네스 없음(harness-off) 폴더를 복사하고,
# 각각 패키지를 설치한 뒤 독립된 git 저장소로 만들어 첫 커밋을 남깁니다.
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd)
target=${1:-$HOME/harness-demo}
for name in harness-on harness-off; do
  if [ -e "$target/$name" ]; then
    echo "이미 있습니다: $target/$name (다른 폴더를 지정하거나 지운 뒤 다시 실행하세요)" >&2
    exit 1
  fi
done
mkdir -p "$target"
for name in harness-on harness-off; do
  dest="$target/$name"
  cp -R "$here/$name" "$dest"
  (
    cd "$dest"
    npm install --silent --no-audit --no-fund
    git init -q
    git add -A
    if [ -z "$(git config user.name || true)" ]; then
      git -c user.name="codex-reader" -c user.email="reader@example.com" commit -qm "14장 실습을 마친 상태"
    else
      git commit -qm "14장 실습을 마친 상태"
    fi
  )
  echo "준비됨: $dest"
done
cat <<MSG

다음 순서로 진행하세요.
1. 앱에서 두 폴더를 각각 프로젝트로 추가합니다. 이름은 '하네스 있음'($target/harness-on), '하네스 없음'($target/harness-off).
2. [Settings > Hooks]에서 '하네스 있음'의 훅을 확인하고 신뢰합니다(03단계). '하네스 없음'에는 훅이 없습니다.
3. 06단계부터 진행합니다.
MSG
