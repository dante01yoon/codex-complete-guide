# 16장 여러 에이전트의 협업을 설계하는 그래프 엔지니어링

『코덱스 완벽 가이드』 16장 실습 자료입니다. 챗GPT 앱(macOS, Codex CLI 0.160.0 내장)과 GPT-6.1-Sol(medium)로 진행했고, reviewer만 GPT-6-Astra를 썼습니다. 작성 기준일은 2026년 10월 6일입니다.

`ev-booking/`은 3부를 모두 마친 충전소 예약 서비스입니다(테스트 171개).

| 파일 | 내용 |
|---|---|
| `ev-booking/.codex/agents/` | planner, tester, implementer, reviewer 커스텀 에이전트 |
| `ev-booking/docs/agents.md` | 네 에이전트의 그래프와 인계 내용 |
| `ev-booking/src/mcp/` | 자연어 예약용 MCP 서버(search_chargers, hold_slot, request_payment)와 사람 승인 명령 |
| `ev-booking/.codex/config.toml` | booking MCP 서버 등록, request_payment 도구별 승인(approval_mode = "prompt") |
| `prompts.md` | 16장에서 보낸 요청과 명령 |

## 사용 방법

```sh
cd ev-booking
npm ci
npx vitest run
```

- `.codex/config.toml`의 `cwd`는 내 컴퓨터의 ev-booking 경로로 바꾸세요.
- 결제 링크가 필요하면 터미널에서 `npm run approve -- <holdId>`를 직접 실행합니다. 이 승인은 코덱스가 대신할 수 없도록 `.codex/guard.sh`가 막습니다.
- 결제 링크는 시연용 로컬 주소이며 실제 결제는 일어나지 않습니다.

## 결제 링크와 결제 화면 연결(09~10단계)

`request_payment`가 만든 링크는 `npm run demo:checkout`으로 띄운 결제 시연 서버(`127.0.0.1:5180`)에서 열립니다. MCP 서버는 점유와 주문번호를 임시 폴더의 공유 파일에 남기고, 결제 서버는 그 파일과 `.codex/approvals`의 사람 승인을 읽어 승인된 유효 주문에만 결제 위젯을 띄웁니다. 테스트는 179개입니다.
