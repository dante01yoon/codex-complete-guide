# 15장 요청 프롬프트와 명령

챗GPT 앱의 '충전소 예약' 프로젝트(ev-booking 폴더)에서 GPT-6.1-Sol(medium)로 진행했습니다.

## .env에 테스트 키 적기

```text
TOSS_CLIENT_KEY=문서에 공개된 test_gck_docs_ 키
TOSS_SECRET_KEY=문서에 공개된 test_gsk_docs_ 키
```

## 결제 흐름 정리 요청

```text
15장 실습을 시작할게. 예약금 결제를 토스페이먼츠 테스트 모드로 연결하려고 해. 먼저 https://docs.tosspayments.com/guides/v2/payment-widget/integration 과 결제 승인 API 문서를 읽고, 결제 위젯 → successUrl → 서버에서 승인 API 호출 → 예약 확정으로 이어지는 흐름을 정리해 줘. 키는 .env의 TOSS_SECRET_KEY와 TOSS_CLIENT_KEY(문서에 공개된 테스트 키)를 쓰고, 값은 출력하지 마. 그리고 이 흐름에서 꼭 확인해야 할 것(금액 위변조, 같은 결제의 중복 승인, 승인 기한)을 수용 기준 번호와 연결해서 표로 보여 줘. 아직 코드는 만들지 마
```

## 결제 정책 결정과 테스트 요청

```text
좋아. 남은 결정은 이렇게 할게. C-04: 임시 점유는 정확히 10분이 되는 순간 만료되고, 만료 뒤에 승인이 오면 예약을 만들지 않고 3,000원을 전액 환불해. C-07: 결제 수단은 카드만, 승인 응답 상태가 DONE일 때만 완료로 봐. 환불 실패는 최대 3번 다시 시도하고 그래도 실패하면 운영자 확인 필요 상태로 둬. 금액 조작 거절과 토스 승인 기한은 수용 기준에 새 AC로 추가해 줘. 그다음 결제 승인(src/payments/confirm.ts)과 웹훅 처리(src/payments/webhook.ts)를 위한 테스트를 먼저 써 줘. 토스 API는 실제로 부르지 말고 가짜 응답을 돌려주는 테스트 대역을 써. 같은 웹훅이 두 번 와도 예약은 한 번만 확정되고, 금액이 다르면 승인하지 않는 경우를 꼭 넣어 줘. 테스트를 쓰면 멈추고 확인을 받아
```

## 테스트 작성 스위치 요청

```text
좋은 지적이야. 하네스를 이렇게 고치자. .codex/guard.sh를 수정해서, 프로젝트 폴더에 .codex/TEST_WRITING 파일이 있을 때만 tests/ 폴더에 새 파일을 추가하거나 고칠 수 있게 해 줘. 이 파일은 사람이 터미널에서 직접 만들고 지우는 스위치라서, 코덱스가 이 파일을 만들거나 지우는 명령과 패치는 막아야 해. 또 .codex 폴더의 훅 파일(guard.sh, verify.sh, hooks.json)을 고치는 것도 막아 줘. 훅 스크립트는 바뀌어도 다시 신뢰를 묻지 않으니까. 이번 수정만 예외로 하고, 고친 뒤 막아야 할 입력과 통과할 입력으로 다시 시험해 줘
```

## 스위치를 켜고 테스트 작성(ev-booking 폴더에서)

```text
touch .codex/TEST_WRITING
```

## 루프 스크립트 요청

```text
테스트 17개 확인했어. 스위치는 껐고 테스트는 커밋했어. 이번에는 구현을 대화로 맡기지 않고 반복 루프로 돌릴 거야. scripts/loop.sh를 만들어 줘. 사용법은 scripts/loop.sh "작업 설명"이고, 한 바퀴마다 npx vitest run으로 테스트를 돌려서 모두 통과하면 멈추고, 실패하면 실패한 테스트 이름을 넣어 codex exec로 구현을 고치게 해. 종료 조건은 모두 통과, 최대 5바퀴, 전체 20분, 같은 테스트가 3바퀴 연속 실패, 바퀴가 끝날 때 tests/ 폴더가 커밋과 달라졌거나 .codex/TEST_WRITING이 있으면 즉시 중단이야. 바퀴마다 걸린 시간, 통과·실패 개수, 바뀐 파일을 logs/loop-날짜.md에 기록해 줘. codex exec는 workspace-write 샌드박스로 실행하고, 스크립트를 만들기만 하고 실행하지는 마
```

## 루프 실행(ev-booking 폴더에서)

```text
scripts/loop.sh "src/payments/confirm.ts와 src/payments/webhook.ts를 구현해 tests/payments의 테스트를 통과시켜 줘. 정책은 docs/prd.md와 docs/acceptance.md의 AC-05를 따른다."
```

## 노쇼·승계 테스트 요청(새 채팅, 스위치를 켠 뒤)

```text
테스트 작성 스위치를 켰어. 노쇼 자동 취소(AC-16)와 대기자 승계(AC-11)의 수용 기준을 tests/rules/succession.test.ts에 Vitest 테스트로 써 줘. 시작 후 정확히 15분에 노쇼 처리, 노쇼 뒤 첫 번째 대기자에게 결제 요청, 10분 안에 결제하지 않으면 다음 대기자로, 남은 시간이 30분 미만이면 승계하지 않음, 승계자의 체크인 기한은 승계 확정 시각부터 15분, 운영자 취소 때는 승계하지 않고 대기도 취소하는 경우를 꼭 넣어 줘. 구현은 src/rules/succession.ts에 할 예정이고, 이번에는 테스트만 쓰고 실패하는 것을 보여 준 다음 멈춰
```

## 노쇼·승계 루프 실행

```text
scripts/loop.sh "src/rules/succession.ts를 구현해 tests/rules/succession.test.ts를 통과시켜 줘. 정책은 docs/prd.md와 docs/acceptance.md의 AC-11, AC-16을 따른다."
```

## 루프 결과 리뷰 요청(새 채팅, 입력창에 /review를 입력해 Review Agent 선택)

```text
이번 루프에서 만든 src/payments/confirm.ts, src/payments/webhook.ts, src/rules/succession.ts를 검토해 줘. 테스트가 다루지 않는 위험을 중심으로 P1부터 P3까지 우선순위를 붙여 주고, 코드는 고치지 마.
```

## 실제 테스트 서버 연결 확인 요청

```text
마지막으로 실제 토스페이먼츠 테스트 서버와 연결되는지 확인하고 싶어. .env의 TOSS_SECRET_KEY로 src/payments/confirm.ts가 쓰는 것과 같은 방식(Basic 인증)으로 결제 승인 API에 존재하지 않는 paymentKey와 orderId로 요청을 한 번만 보내서, 인증이 통과하고 '결제를 찾을 수 없다'는 종류의 오류가 오는지 확인해 줘. 키 값과 인증 헤더는 출력하지 말고, 응답의 HTTP 상태와 code만 보여 줘. 결과를 scripts/smoke-toss.mjs로 남겨 다시 실행할 수 있게 해 줘
```

