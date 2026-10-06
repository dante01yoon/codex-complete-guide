#!/bin/bash
# 학습용 문자열 가드. 셸을 실행하거나 입력 원문/키 값을 출력하지 않는다.
set -euo pipefail
command -v jq >/dev/null || { printf 'jq가 없어 안전 검사를 수행할 수 없습니다.\n' >&2; exit 2; }
deny() {
  jq -n --arg reason "$1" '{hookSpecificOutput:{hookEventName:"PreToolUse",permissionDecision:"deny",permissionDecisionReason:$reason}}'
  exit 0
}
payload=$(cat)
if ! printf '%s' "$payload" | jq -e 'type == "object"' >/dev/null 2>&1; then
  deny '훅 입력이 올바른 JSON 객체가 아니어서 실행을 차단했습니다.'
fi
tool=$(printf '%s' "$payload" | jq -r '.tool_name // ""')
case "$tool" in
  apply_patch|Bash|exec_command|shell|shell_command|functions.apply_patch|functions.exec_command) ;;
  *) printf '{}\n'; exit 0 ;;
esac
# Codex 표준 command, 직접 시험용 cmd/patch 및 문자열 입력을 지원한다.
if ! input=$(printf '%s' "$payload" | jq -er '.tool_input | if type == "string" then . else (.command // .cmd // .patch) end | select(type == "string")'); then
  deny '명령 또는 패치를 읽을 수 없어 실행을 차단했습니다.'
fi
if printf '%s' "$input" | LC_ALL=C grep -Eq 'live_(sk|gsk|ck|gck)_'; then
  deny '토스페이먼츠 실제 키가 포함되어 실행을 차단했습니다. test_로 시작하는 테스트 키만 사용하세요.'
fi
tests_path='(^|[^[:alnum:]_.-])tests(/|$|[^[:alnum:]_.-])'
# 사용자 제공 cwd가 아닌, 실행 중인 가드 자신의 프로젝트 루트에서만 스위치를 확인한다.
project_root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)
test_writing=false
if [[ -f "$project_root/.codex/TEST_WRITING" && ! -L "$project_root/.codex/TEST_WRITING" ]]; then
  test_writing=true
fi
workdir=$(printf '%s' "$payload" | jq -r '(if (.tool_input | type) == "object" then .tool_input.workdir else null end) // .cwd // ""')
[[ -n "$workdir" ]] || workdir="$project_root"
normalize_path() {
  local candidate="$1"
  local normalized
  [[ "$candidate" = /* ]] || candidate="$workdir/$candidate"
  normalized=$(printf '%s' "$candidate" | jq -Rr '
    split("/") | reduce .[] as $part ([];
      if $part == "" or $part == "." then .
      elif $part == ".." then .[0:-1]
      else . + [$part] end) | "/" + join("/")')
  if [[ -d "$normalized" ]]; then
    (cd -- "$normalized" && pwd -P)
  else
    printf '%s\n' "$normalized"
  fi
}
workdir=$(normalize_path "$workdir")
is_protected_path() {
  [[ "$1" == "$project_root" ]] ||
    printf '%s' "$1" | LC_ALL=C grep -Eq '(^|/)\.codex($|/(TEST_WRITING|guard\.sh|verify\.sh|hooks\.json)(/|$))'
}
# 스위치/훅 경로를 읽기만 하는 단일 명령은 허용한다. 출력 파일·명령 결합은 제외한다.
simple=true
case "$input" in *[';&|><`$']*|*$'\n'*|*\\*|*'('*|*')'*) simple=false ;; esac
case "$input" in *--output*|*--ext-diff*|*--textconv*|*--pre*|*--exec*|*--open*) simple=false ;; esac
readonly=false
if "$simple"; then
  case "$input" in
    cat\ *|ls\ *|head\ *|tail\ *|wc\ *|rg\ *|grep\ *|git\ diff\ *|git\ status\ *|git\ show\ *|bash\ -n\ *) readonly=true ;;
    npx\ vitest\ run*|npx\ tsc\ --noEmit*)
      case "$input" in *--update*|*' -u'*|*--outputFile*|*--reporter*|*--config*) ;; *) readonly=true ;; esac ;;
  esac
fi
case "$tool" in
  *apply_patch)
    # 内容本文ではなく変更先を検査。移動は元と先の両方を確認する。
    paths=$(printf '%s\n' "$input" | sed -nE 's/^\*\*\* (Add File|Update File|Delete File|Move to):[[:space:]]*//p')
    touches_tests=false
    while IFS= read -r path; do
      [[ -n "$path" ]] || continue
      normalized=$(normalize_path "$path")
      if is_protected_path "$normalized"; then
        deny '사람용 TEST_WRITING 스위치와 .codex 훅 파일 및 상위 폴더는 코덱스가 추가·수정·삭제·이동할 수 없습니다.'
      fi
      if printf '%s' "$normalized" | LC_ALL=C grep -Eq "$tests_path"; then
        touches_tests=true
      fi
    done <<< "$paths"
    if "$touches_tests"; then
      if printf '%s' "$input" | LC_ALL=C grep -Eq '^\*\*\* (Delete File|Move to):'; then
        deny 'TEST_WRITING 모드에서도 tests/ 파일 삭제·이동은 허용하지 않습니다.'
      fi
      "$test_writing" || deny 'tests/ 추가·수정은 사람이 프로젝트 .codex/TEST_WRITING 파일을 직접 만든 테스트 작성 모드에서만 허용합니다.'
    fi
    ;;
  *)
    # 裸のファイル名も検査し、.codexをcwdにしたtouch/rm等を防ぐ。
    if printf '%s' "$input" | LC_ALL=C grep -Eq '(^|[^[:alnum:]_.-])(TEST_WRITING|guard\.sh|verify\.sh|hooks\.json)([^[:alnum:]_.-]|$)'; then
      "$readonly" || deny '사람용 TEST_WRITING 스위치와 .codex 훅 파일을 변경할 수 있는 명령은 금지합니다.'
    fi
    # 부모 폴더 전체의 삭제·이동도 보호한다. 입력을 실행하지 않고 경로 토큰만 검사한다.
    if ! "$readonly" && printf '%s' "$input" | LC_ALL=C grep -Eq '(^|[[:space:]/;&|])(rm|rmdir|mv|unlink)([[:space:]]|$)'; then
      read -r -a words <<< "$input"
      for word in "${words[@]}"; do
        word=${word//\"/}
        word=${word//\'/}
        [[ "$word" != -* ]] || continue
        normalized=$(normalize_path "$word")
        if is_protected_path "$normalized"; then
          deny '프로젝트 루트와 .codex 보호 폴더 전체를 삭제·이동할 수 없습니다.'
        fi
      done
    fi
    if printf '%s\n%s' "$input" "$workdir" | LC_ALL=C grep -Eq "$tests_path"; then
      if ! "$readonly"; then
        writable=false
        # 모드가 켜져도 명령 결합·인터프리터·삭제·이동은 열지 않는다.
        write_simple=true
        case "$input" in *[';&|`$']*|*$'\n'*|*\\*|*'('*|*')'*) write_simple=false ;; esac
        if "$test_writing" && "$write_simple"; then
        case "$input" in
          touch\ *|mkdir\ *|cp\ *|sed\ -i\ *|printf\ *|echo\ *|tee\ *) writable=true ;;
        esac
        fi
        "$writable" || deny 'tests/ 변경 명령은 TEST_WRITING 모드의 단순 추가·수정만 허용합니다. 삭제·이동·임의 스크립트·복합 명령은 금지합니다.'
      fi
    fi
    ;;
esac
# allow 결정으로 기존 권한 검사를 우회하지 않는다.
printf '{}\n'
