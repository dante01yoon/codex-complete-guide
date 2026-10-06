# 14장 에이전트의 작업 환경을 설계하는 하네스 엔지니어링

『코덱스 완벽 가이드』 14장 실습 자료입니다. 챗GPT 앱(macOS, Codex CLI 0.160.0 내장)과 GPT-6.1-Sol(medium)로 진행했습니다. 작성 기준일은 2026년 10월 6일입니다.

`ev-booking/`은 [실습 16]을 마친 상태입니다.

| 파일 | 내용 |
|---|---|
| `ev-booking/AGENTS.md` | 목차 역할의 작업 지침. 예약·결제 도메인 규칙, 막혔을 때의 처리 |
| `ev-booking/.codex/hooks.json` | PreToolUse에 guard.sh, Stop에 verify.sh 연결 |
| `ev-booking/.codex/guard.sh` | tests/ 변경과 토스페이먼츠 실제 키(live_) 입력 차단 |
| `ev-booking/.codex/verify.sh` | 응답을 마치기 전 Vitest·타입 검사 실행, 실패 시 계속 고치게 함(stop_hook_active로 반복 제한) |
| `ev-booking/.codex/selftest.py` | 훅 스크립트 직접 시험 |
| `ev-booking/docs/harness.md` | 하네스 구성과 한계 |
| `prompts.md` | 14장에서 보낸 요청 |

## 주의

- 훅은 앱의 [Settings > Hooks] 또는 CLI의 /hooks에서 신뢰해야 동작합니다. 신뢰하지 않은 프로젝트 훅은 경고 없이 건너뜁니다.
- hooks.json은 `git rev-parse --show-toplevel`로 경로를 찾으므로, `ev-booking` 폴더에서 `git init` 후 사용하세요.
- 스크립트는 jq를 사용합니다.
