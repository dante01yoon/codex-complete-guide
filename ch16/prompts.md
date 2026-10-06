# 16장 요청 프롬프트와 명령

챗GPT 앱의 '충전소 예약' 프로젝트(ev-booking 폴더)에서 GPT-6.1-Sol(medium)로 진행했습니다. reviewer 에이전트는 GPT-6-Astra입니다.

## 역할별 에이전트 요청

```text
16장 실습을 시작할게. 이 프로젝트의 .codex/agents 폴더에 역할이 다른 커스텀 에이전트 네 개를 만들어 줘. planner는 docs와 tasks.md를 읽고 기능 하나를 작업 단위와 수용 기준으로 나누는 계획 담당이고 파일을 고치지 않아. tester는 계획을 받아 tests/에 실패하는 테스트만 쓰는 테스트 담당이야. implementer는 tests/를 고치지 않고 src/만 고쳐서 테스트를 통과시키는 구현 담당이야. reviewer는 변경을 검토해 P1~P3로 보고하고 파일을 고치지 않는 리뷰 담당이야. 각 에이전트의 description에 언제 쓰는지 분명히 적고, developer_instructions에 AGENTS.md와 헌법을 따르라고 적어 줘. reviewer는 구현과 다른 모델인 GPT-6-Astra로 해 줘. 그리고 docs/agents.md에 네 에이전트가 어떤 순서로 일하고 무엇을 주고받는지 그래프로 정리해 줘
```

## 도구 설계와 계획·테스트 요청(스위치를 켠 뒤)

```text
이제 이 에이전트들로 기능 하나를 만들자. 만들 기능은 자연어 예약 에이전트가 쓸 도구야. 코덱스가 '강남역 근처 DC콤보 충전기를 오늘 저녁 7시에 30분 예약해 줘' 같은 요청을 처리할 수 있도록, 로컬 MCP 서버(src/mcp/booking-server.ts)에 도구 세 개를 만들 거야. search_chargers는 ../ev-map/data에서 위치·커넥터로 예약 가능한 충전기를 찾고(위경도와 반경으로 검색), hold_slot은 src/rules의 규칙으로 겹침과 자격을 검사해 10분 임시 점유를 만들고, request_payment는 점유한 예약의 결제를 요청하는데 사람이 승인한 경우에만 결제 링크를 만들어. 실제 결제는 하지 않아. 순서는 docs/agents.md 그래프대로 해 줘. 먼저 planner 서브에이전트로 계획을 세우고, tester 서브에이전트로 테스트를 써서 나에게 확인을 받아. 테스트 작성 스위치는 켜 뒀어
```

## 사람 승인 방식 결정

```text
테스트 이름은 확인했어. 사람 승인 방식(C-12)은 이렇게 정할게. request_payment는 승인이 없으면 결제하지 않고 APPROVAL_REQUIRED와 함께 충전소·시간·금액 요약과 승인 명령을 돌려줘. 사람은 터미널에서 npm run approve -- <holdId>를 직접 실행하고, 이 명령은 .codex/approvals/<holdId> 파일을 만들어. 나는 가드를 고쳐서 코덱스가 .codex/approvals를 만들거나 고치지 못하게 막아 뒀어. request_payment는 이 파일이 있고 점유가 아직 유효할 때만 테스트 결제 링크를 만들어. 이 결정을 문서와 테스트에 반영해 줘(tester 서브에이전트). 그다음 내가 테스트 작성 스위치를 끄면 implementer 서브에이전트로 구현하고, reviewer 서브에이전트로 검토하고, P1이 있으면 implementer로 다시 고치는 순서로 진행해 줘. 지금은 테스트 반영까지만 하고 멈춰
```

## 구현과 리뷰 요청

```text
테스트 작성 스위치를 끄고 테스트를 커밋했어. 이제 그래프대로 진행해 줘. implementer 서브에이전트로 구현해서 테스트를 통과시키고, reviewer 서브에이전트로 검토해. P1이 나오면 implementer로 다시 고친 뒤 reviewer로 다시 검토하되, 이 반복은 최대 2번까지만 해. 끝나면 각 에이전트가 무엇을 주고받았는지 순서대로 표로 보여 줘
```

## 프로젝트의 MCP 서버 등록(.codex/config.toml)

```text
[mcp_servers.booking]
command = "npm"
args = ["run", "mcp"]
[mcp_servers.booking.tools.request_payment]
approval_mode = "prompt"
```

## 자연어 예약 요청

```text
강남역 근처 1km 안에서 DC콤보 충전기를 오늘 밤 11시 30분부터 30분 예약하고 싶어. booking 도구로 찾아서 가장 가까운 곳을 임시 점유해 주고, 결제까지 진행해 줘
```

## 사람의 승인(ev-booking 폴더에서)

```text
npm run approve -- hold-c61c24b1-9ca5-4669-9081-038c3705481e
```


## 09~10단계 결제 링크를 15장 결제 화면에 연결하기

1. 16장 실습을 이어서 할게. request_payment가 돌려주는 결제 링크(http://127.0.0.1:5180/checkout/주문번호)를 열면, 15장에서 만든 결제 시연 서버가 그 주문의 충전소, 예약 시간, 예약금 3,000원을 보여 주고 결제 위젯을 띄우도록 연결해 줘. 점유 정보와 사람 승인 파일은 MCP 서버가 쓰는 것을 그대로 읽고, 승인이 없거나 점유가 끝난 주문이면 결제 화면 대신 그 이유를 보여 줘. 기존 tests/ 파일은 고치지 마. 다 되면 결제 시연 서버를 다시 띄우고 확인 방법을 알려 줘.
2. (터미널에서 touch .codex/TEST_WRITING 실행 후) 계획 좋아. 공유 파일 방식과 테스트 8개로 진행해. tests/payments/mcp-checkout.test.ts를 쓰고 나면 멈추고, 테스트 이름과 기대 결과를 보여 줘.
3. (스위치를 끄고, 터미널에서 테스트 파일을 직접 커밋한 뒤) 이어서 테스트를 실행해 실패하는 것과 실패 이유를 보여 준 다음, src만 고쳐서 구현해 줘. 끝나면 전체 테스트와 타입 검사를 돌리고, git diff로 tests/가 그대로인지 확인한 뒤, 결제 시연 서버를 다시 띄워 줘.
4. (새 채팅) 강남역 근처 1km 안에서 DC콤보 충전기를 10월 7일 오후 3시부터 30분 예약하고 싶어. booking 도구로 찾아서 가장 가까운 곳을 임시 점유해 주고, 결제까지 진행해 줘
5. (터미널에서 npm run approve -- <holdId> 실행 후) 승인 명령을 실행했어. 결제 링크를 다시 요청해 줘.
