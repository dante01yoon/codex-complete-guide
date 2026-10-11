# 14장 에이전트의 작업 환경을 설계하는 하네스 엔지니어링

『코덱스 완벽 가이드』 14장 실습 자료입니다. 챗GPT 앱(macOS)과 GPT-6.1-Sol(medium)로 진행했습니다. 작성 기준일은 2026년 10월 11일입니다.

`ev-booking/`은 [실습 14]의 05단계까지 마친 상태입니다.

| 파일 | 내용 |
|---|---|
| `ev-booking/AGENTS.md` | 목차 역할의 작업 지침. 예약·결제 도메인 규칙, 막혔을 때의 중단·보고 기준 |
| `ev-booking/.codex/hooks.json` | UserPromptSubmit·PreToolUse(모든 도구)에 guard.sh, Stop에 verify.sh 연결 |
| `ev-booking/.codex/guard.sh` | tests/ 변경과 토스페이먼츠 실제 키(live_)가 든 입력 차단 |
| `ev-booking/.codex/verify.sh` | 일을 끝내기 전 규칙 테스트·타입 검사 실행. 첫 실패에 한 번 더 고치게 하고, 다시 실패하면 멈춤 |
| `ev-booking/.codex/README.md` | 훅 동작과 스크립트를 직접 시험하는 명령 |
| `ev-booking/docs/harness.md` | 하네스 구성과 한계 |
| `prompts.md` | 14장에서 보낸 요청 |
| `harness-on/` | '하네스 효과를 화면으로 확인하기'의 하네스 있음 프로젝트(05단계까지 마친 상태) |
| `harness-off/` | 같은 프로젝트에서 `.codex`, `AGENTS.md`, `.specify`, `docs/harness.md`를 지운 하네스 없음 프로젝트 |
| `harness-feature/` | 06단계 확인 화면(`demo/`)과 '하네스로 기능 만들기'(08~10단계)를 마친 프로젝트. 폴더의 README 참고 |
| `setup-harness-demo.sh` | 두 폴더를 `~/harness-demo`로 복사하고 패키지 설치, `git init`, 첫 커밋까지 해 주는 준비 스크립트 |

`harness-on`과 `harness-off`는 이 저장소 안에서 그대로 열지 말고 `bash ch14/setup-harness-demo.sh`로 꺼내서 쓰세요. 훅이 git 저장소의 맨 위 폴더를 기준으로 스크립트를 찾기 때문입니다.

## 주의

- 훅은 앱의 [Settings > Hooks] 또는 CLI의 /hooks에서 신뢰해야 동작합니다. 신뢰하지 않은 프로젝트 훅은 경고 없이 건너뜁니다.
- hooks.json은 `git rev-parse --show-toplevel`로 경로를 찾으므로, `ev-booking` 폴더에서 `git init` 후 사용하세요.
- 훅 스크립트는 Node.js로 실행합니다. 따로 설치할 것은 없습니다.
- guard.sh는 tests/ 경로가 든 복합 셸 명령(`;`, `&&`로 묶은 명령)을 읽기 명령이라도 막습니다. 막히면 명령을 하나씩 나눠 실행하게 하세요.

## 다른 프로젝트에 하네스 붙이기

이 장의 훅과 AGENTS.md 규칙을 어떤 프로젝트에나 설치할 수 있게 정리한 키트는 [codex-harness-kit](https://github.com/dante01yoon/codex-harness-kit)에 있습니다. 설치 명령을 한 번 실행하면 프로젝트의 테스트 도구(Node, Python, Go)에 맞춰 보호할 경로와 검증 명령을 정하고, `harness.py doctor`로 설치 상태를 점검할 수 있습니다. 설치한 뒤에도 훅은 신뢰해야 동작합니다. 0.2.1부터는 화면 확인(`harness.py see`)과 맞춤 린트(`harness.py lint`)도 들어 있습니다. `--lint --see-url --see-start --see-verify` 옵션으로 켭니다(14.9).
