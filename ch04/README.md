# 4장 코덱스 CLI 고급 기능 활용하기

Codex CLI 0.160.0(macOS)과 챗GPT 데스크톱 앱에서 실행한 실습 자료입니다. 작성 기준일은 2026년 10월 3일입니다.

| 폴더 | 내용 | 놓을 위치 |
|---|---|---|
| [profiles](profiles/) | 오픈라우터 제공자 정의, 오픈라우터·코드 검토용 프로필 | `~/.codex/` |
| [agents](agents/) | 검토 담당 커스텀 에이전트 `reviewer.toml` | 프로젝트의 `.codex/agents/` |
| [hooks](hooks/) | `hooks.json`, 알림 스크립트(macOS·Windows), rm 차단 스크립트 | `~/.codex/hooks.json`, `~/.codex/hooks/` |
| [exec](exec/) | `codex exec`용 출력 스키마와 PR 사전 검사 기준 | 실습 저장소 바깥 |
| [pr-check-practice](pr-check-practice/) | [실습 03] PR 사전 검사 저장소 원본 | `bash setup.sh ~/Documents/pr-check-practice` |
| [racing-game](racing-game/) | [실습 04] 3D 레이싱 게임 완성본(미니맵, 자동 주행 테스트 모드 포함) | `~/Documents/racing-game` |

## 실행 메모

- 오픈라우터 키는 파일에 적지 말고 `export OPENROUTER_API_KEY=...`로 환경 변수에 넣으세요.
- 훅 스크립트는 `chmod +x`로 실행 권한을 주고, 코덱스를 실행한 뒤 `/hooks`에서 신뢰해야 동작합니다.
- 레이싱 게임은 `python3 -m http.server 8000`으로 띄운 뒤 `http://localhost:8000`에서 실행합니다. `?autopilot=1`을 붙이면 자동 주행 테스트 모드로 달립니다.

## 실습에 사용한 모델

| 실습 | 사용한 모델 | 권장 |
|---|---|---|
| [실습 02] 알림창 | GPT-6.1-Sol(medium) | 가벼운 모델로 충분 |
| [실습 03] PR 사전 검사 | GPT-6.1-Sol(medium) | GPT-6.1-Sol(low~medium), 중요한 리뷰만 GPT-6-Astra |
| [실습 04] 3D 레이싱 게임 | 계획 medium, 첫 구현 xhigh, 기능 추가·플레이 테스트 medium (GPT-6.1-Sol) | 첫 구현은 high~xhigh 또는 GPT-6-Astra |
