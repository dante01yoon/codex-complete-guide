# 15장 실행과 검증을 반복하는 루프 엔지니어링

『코덱스 완벽 가이드』 15장 실습 자료입니다. 챗GPT 앱(macOS, Codex CLI 0.160.0 내장)과 GPT-6.1-Sol(medium)로 진행했습니다. 작성 기준일은 2026년 10월 6일입니다.

`ev-booking/`은 [실습 15]를 마친 상태입니다(테스트 109개).

| 파일 | 내용 |
|---|---|
| `ev-booking/scripts/loop.sh` | codex exec와 Vitest로 도는 반복 루프(최대 5바퀴, 20분, 같은 테스트 3바퀴 연속 실패 시 중단) |
| `ev-booking/logs/` | 노쇼·승계 루프와 리뷰 반영 루프의 기록 |
| `ev-booking/src/payments/` | 토스페이먼츠 결제 승인(confirm.ts)과 웹훅 처리(webhook.ts) |
| `ev-booking/src/rules/succession.ts` | 노쇼 자동 취소와 대기자 승계 |
| `ev-booking/scripts/smoke-toss.mjs` | 토스페이먼츠 테스트 서버 연결 확인 |
| `ev-booking/.codex/guard.sh` | 사람이 켜고 끄는 테스트 작성 스위치(.codex/TEST_WRITING)를 더한 가드 |
| `prompts.md` | 15장에서 보낸 요청과 명령 |

## 사용 방법

- `.env`에 토스페이먼츠 테스트 키를 `TOSS_CLIENT_KEY`, `TOSS_SECRET_KEY`로 넣습니다. 문서에 공개된 테스트 키(test_gck_docs_, test_gsk_docs_)를 쓸 수 있습니다. 실제 키(live_)는 쓰지 마세요.
- 테스트를 쓸 때만 `touch .codex/TEST_WRITING`으로 스위치를 켜고, 확인 후 `rm .codex/TEST_WRITING`으로 끈 다음 커밋합니다.
- 루프: `scripts/loop.sh "작업 설명"`

## 결제 시연 서버(15단계)

15단계에서 만든 결제 시연 서버(`src/payments/demo-server.ts`)는 16장에서 추가한 예약 규칙(`src/rules/booking.ts`)을 함께 쓰므로 `ch16/ev-booking` 폴더에 들어 있습니다. `.env`에 토스페이먼츠 문서용 테스트 키를 적은 뒤 `npm run demo:checkout`으로 실행하고 `http://127.0.0.1:5180/`을 여세요. 카드사 인증 화면은 국내 네트워크에서만 열리는 경우가 있습니다.
