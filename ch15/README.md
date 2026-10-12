# 15장 실행과 검증을 반복하는 루프 엔지니어링

『코덱스 완벽 가이드』 15장 실습 자료입니다. 챗GPT 앱(macOS)과 GPT-6.1-Sol(medium)로 진행했습니다. 작성 기준일은 2026년 10월 11일입니다.

`ev-booking/`은 [실습 15]를 마친 상태입니다(규칙 테스트 156개).

| 파일 | 내용 |
|---|---|
| `ev-booking/scripts/loop.sh`, `scripts/loop.mjs`, `docs/loop.md` | codex exec로 구현하고 테스트·타입 검사로 판정하는 반복 루프. `scripts/loop.sh "작업 설명"`. 최대 5바퀴, 20분, 같은 테스트 3바퀴 연속 실패, 테스트·보호 파일 변경, 훅 차단 시 중단. 기록은 `artifacts/loops/`에 남음 |
| `ev-booking/src/rules/payment.ts` | 결제 승인 요청 검증, 승인·웹훅 결과 반영(중복 보호, 늦은 승인 환불) |
| `ev-booking/src/rules/no-show.ts`, `succession.ts` | 노쇼 자동 취소와 대기자 승계 |
| `ev-booking/tests/rules/` | 결제 승인·웹훅, 노쇼, 승계, 리뷰 재현 테스트 |
| `ev-booking/.codex/guard.sh` | 사람이 켜고 끄는 테스트 작성 스위치(`.codex/TEST_WRITING`)를 더한 가드. 스위치와 훅 파일은 코덱스가 바꿀 수 없음 |
| `ev-booking/scripts/toss-auth-probe.mjs` | 토스페이먼츠 테스트 서버 연결 확인(없는 결제로 승인 API를 한 번 호출) |
| `ev-booking/src/demo/` | 토스페이먼츠 결제 위젯 시연 서버(`npm run demo:payment`, 127.0.0.1:5180) |
| `ev-booking/demo/` | 루프 기록 화면(`node demo/server.mjs`, 127.0.0.1:5181). `artifacts/loops`를 읽으므로 루프를 한 번 이상 돌린 뒤 실행 |
| `examples/` | 15장 이론 절의 예시(가장 단순한 루프, 후보 비교) |
| `prompts.md` | 15장에서 보낸 요청 |

## 사용 방법

- `.env`에 토스페이먼츠 테스트 키를 `TOSS_CLIENT_KEY`, `TOSS_SECRET_KEY`로 넣습니다. 문서에 공개된 테스트 키(test_gck_docs_, test_gsk_docs_)를 쓸 수 있습니다. 실제 키(live_)는 쓰지 마세요.
- 테스트를 쓸 때만 `touch .codex/TEST_WRITING`으로 스위치를 켜고, 확인 후 `rm .codex/TEST_WRITING`으로 끈 다음 커밋합니다.
- 루프: `scripts/loop.sh "작업 설명"`. 헌법에 따라 사람이 확인한 테스트만 구현하므로, 작업 설명에 테스트를 확인했다고 적어 주세요.
- 카드사 인증 화면은 국내 네트워크에서만 열리는 경우가 있습니다.
