# 16장 여러 에이전트의 협업을 설계하는 그래프 엔지니어링

『코덱스 완벽 가이드』 16장 실습 자료입니다. 챗GPT 앱(macOS)과 GPT-6.1-Sol(medium)로 진행했고, 리뷰 담당만 GPT-6-Astra를 썼습니다. 작성 기준일은 2026년 10월 12일입니다.

`ev-booking/`은 3부를 모두 마친 충전소 예약 서비스입니다(테스트 304개).

| 파일 | 내용 |
|---|---|
| `ev-booking/.codex/agents/` | planner, test_writer, implementer, reviewer(GPT-6-Astra, 읽기 전용) 커스텀 에이전트. 가드가 `.codex/`를 지키므로 사람이 저장 |
| `ev-booking/docs/agents.md` | 네 에이전트의 그래프(계획 → 테스트 작성 → 사용자 확인 → 실패 확인 → 구현 → 리뷰)와 인계 내용 |
| `ev-booking/src/mcp/`, `src/rules/mcp-*.ts` | 자연어 예약용 MCP 서버(search_chargers, hold_charger, request_payment_link). 날짜(`date`)·시작 시각(`startTime`)은 서울 시간 |
| `ev-booking/src/cli/approve.ts` | 사람 승인 명령 `npm run approve -- <holdId>` → `.codex/approvals/<holdId>.json` |
| `ev-booking/.codex/config.toml` | ev_booking MCP 서버 등록, request_payment_link 도구별 승인(approval_mode = "prompt") |
| `ev-booking/.codex/guard.sh` | 14·15장 가드 + `.codex/approvals` 승인 파일 차단 문구 |
| `ev-booking/src/demo/` | 15장 결제 시연 서버에 결제 링크(`/payment/<holdId>`) 연결. 승인 없음·점유 만료면 이유만 표시 |
| `ev-booking/src/graph-view/` | 에이전트 작업 기록 화면(`npm run demo:agents`, 127.0.0.1:5186) |
| `ev-booking/docs/mcp-*.md` | 계획과 검증·리뷰 기록(리뷰 P1: 원본 상태 병합 79.8초 → 10.6ms) |
| `prompts.md` | 16장에서 보낸 요청과 명령 |

## 사용 방법

```sh
cd ev-booking
npm ci
npx vitest run
```

- `.codex/config.toml`의 경로(`cwd`, `EV_BOOKING_*`)는 내 컴퓨터의 ev-booking·ev-map 경로로 바꾸세요. 충전소 원본 데이터는 11장 ev-map의 `data/`를 씁니다.
- 결제 링크가 필요하면 터미널에서 `npm run approve -- <holdId>`를 직접 실행합니다. 코덱스는 `.codex/guard.sh` 때문에 승인 파일을 만들 수 없습니다.
- 결제 화면은 `npm run demo:payment`(127.0.0.1:5180)로 띄웁니다. `.env`에 토스페이먼츠 테스트 키가 필요하고 실제 결제는 일어나지 않습니다.
