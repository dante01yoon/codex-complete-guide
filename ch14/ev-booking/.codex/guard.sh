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
workdir=$(printf '%s' "$payload" | jq -r '(if (.tool_input | type) == "object" then .tool_input.workdir else null end) // .cwd // ""')
case "$tool" in
  *apply_patch)
    # 내용에 tests/가 등장하는 것과 변경 대상 경로를 구분한다. 이동도 검사한다.
    paths=$(printf '%s\n' "$input" | sed -nE 's/^\*\*\* (Add File|Update File|Delete File|Move to):[[:space:]]*//p')
    if printf '%s\n' "$paths" | LC_ALL=C grep -Eq "$tests_path" || { [[ -n "$paths" ]] && printf '%s' "$workdir" | LC_ALL=C grep -Eq "$tests_path"; }; then
      deny 'tests/ 폴더의 파일 추가·수정·삭제·이동은 금지되어 있습니다. 구현 코드를 수정하세요.'
    fi
    ;;
  *)
    if printf '%s\n%s' "$input" "$workdir" | LC_ALL=C grep -Eq "$tests_path"; then
      # 허용 목록은 단일 조회 명령에만 적용한다. 파이프·리다이렉션·치환은 허용하지 않는다.
      simple=true
      case "$input" in *[';&|><`$']*|*$'\n'*|*\\*) simple=false ;; esac
      case "$input" in *--output*|*--ext-diff*|*--textconv*|*--pre*|*--exec*|*--open*) simple=false ;; esac
      readonly=false
      if "$simple"; then
        case "$input" in
          cat\ *|ls\ *|head\ *|tail\ *|wc\ *|rg\ *|grep\ *|git\ diff\ *|git\ status\ *|git\ show\ *) readonly=true ;;
          npx\ vitest\ run*|npx\ tsc\ --noEmit*)
            case "$input" in *--update*|*' -u'*|*--outputFile*|*--reporter*|*--config*) ;; *) readonly=true ;; esac ;;
        esac
      fi
      if ! "$readonly"; then
        deny 'tests/ 폴더를 변경할 수 있는 셸 명령을 차단했습니다. 단순 조회와 테스트 실행만 허용합니다.'
      fi
    fi
    ;;
esac
# allow 결정으로 기존 권한 검사를 우회하지 않는다.
printf '{}\n'
