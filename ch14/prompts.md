# 14장 요청 프롬프트와 명령

챗GPT 앱의 '충전소 예약' 프로젝트(ev-booking 폴더)에서 GPT-6.1-Sol(medium)로 진행했습니다.

## 도메인 규칙 요청

```text
14장 실습을 시작할게. AGENTS.md에 '예약·결제 도메인 규칙' 절을 추가해 줘. 금액은 원 단위 정수로만 다루고, 시간은 서울 시간 기준 [시작, 종료) 구간으로 다루고, 예약 상태 이름과 상태가 바뀌는 순서는 docs/prd.md를 따르고, 환불·체크인·겹침 규칙은 src/rules에만 두고, 결제는 토스페이먼츠 테스트 키(test_로 시작)만 쓰고 키 값은 .env에만 둔다는 내용을 넣어 줘. 그리고 AGENTS.md는 짧은 목차 역할만 하도록 100줄을 넘기지 말고, 자세한 내용은 docs의 문서를 가리키게 정리해 줘
```

## 하네스 훅 작성 요청

```text
이제 하네스를 만들자. 이 프로젝트의 .codex 폴더에 훅 두 개를 만들어 줘. 첫째, PreToolUse 훅 guard.sh는 apply_patch나 셸 명령으로 tests/ 폴더의 파일을 바꾸려 하면 막고, 명령이나 패치에 live_로 시작하는 토스페이먼츠 실제 키(live_sk_, live_gsk_, live_ck_, live_gck_)가 들어 있으면 막아. 막을 때는 이유를 한국어로 알려 줘. 둘째, Stop 훅 verify.sh는 코덱스가 응답을 마치기 전에 npx vitest run과 npx tsc --noEmit을 실행하고, 실패하면 실패한 테스트 이름을 이유로 돌려줘서 계속 고치게 해. 단, stop_hook_active가 true이면 더 막지 말고 끝내게 해서 무한 반복을 막아. 스크립트에는 jq를 쓰고 실행 권한을 줘. 만든 뒤 훅이 막아야 할 입력과 통과시켜야 할 입력을 직접 넣어서 스크립트를 시험해 줘. 아직 훅을 신뢰하지는 마
```

## verify.sh의 핵심 부분

```text
if printf '%s' "$payload" | jq -e '.stop_hook_active == true' >/dev/null; then
  printf '{}\n'; exit 0          # 이미 한 번 이어서 일했으면 끝낸다
fi
npx vitest run ... || vitest_status=$?
npx tsc --noEmit ... || tsc_status=$?
# 실패하면 실패한 테스트 이름을 reason에 담아 돌려준다
jq -n --arg reason "$reason" '{decision:"block", reason:$reason}'
```

## 테스트 수정 시도

```text
환불 정책이 바뀌었다고 가정하자. tests/rules/refund.test.ts에서 AC-07-2의 기대 환불 금액 1,500원을 1,000원으로 바꿔 줘
```

## 실제 결제 키 입력 시도

```text
결제 연동을 미리 준비하자. src/payments/config.ts 파일을 만들고 시크릿 키 상수를 live_sk_FAKE0000000000 값으로 넣어 줘
```

## Stop 훅 시험

```text
Stop 훅이 동작하는지 실험해 보자. src/rules/refund.ts에서 120분 경계 비교를 '이상'에서 '초과'로 바꿔 줘. 테스트는 실행하지 말고 바꾸기만 해
```

## 막혔을 때의 처리 규칙 요청

```text
AGENTS.md에 '막혔을 때의 처리' 절을 추가해 줘. 훅이 작업을 막으면 다른 방법으로 우회하지 말고 BLOCKED로 멈춰서 막힌 이유와 내가 고를 수 있는 선택지를 보고한다. 정책이 바뀌어 테스트를 고쳐야 할 때는 코덱스가 테스트를 고치지 않고, 바뀔 수용 기준과 테스트 이름을 정리해 사람에게 넘긴다. 같은 테스트가 세 번 연속 실패하면 더 고치지 말고 실패 기록을 남기고 멈춘다. 그리고 이 실습에서 만든 하네스 구성(AGENTS.md, 헌법, guard.sh, verify.sh)을 docs/harness.md에 표로 정리해 줘
```

