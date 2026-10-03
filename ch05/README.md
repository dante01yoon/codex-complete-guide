# 5장 코덱스와 더 정확하고 효율적으로 일하기

챗GPT 데스크톱 앱(macOS)과 Codex CLI 0.160.0에서 실행한 실습 자료입니다. 작성 기준일은 2026년 10월 3일입니다.

| 경로 | 내용 |
|---|---|
| [habit-tracker](habit-tracker/) | [실습 05] 습관 트래커 완성본. `AGENTS.md`, 날짜 계산(`dates.mjs`)과 테스트, 다크 모드, 인계 노트(`docs/NOTES.md`) 포함 |
| [meta-prompt.md](meta-prompt.md) | 05.4에서 쓴 메타 프롬프트를 다시 쓸 수 있게 일반화한 것 |

## 실행

```sh
cd habit-tracker
node server.mjs      # http://127.0.0.1:5173
node --test          # 날짜 계산·테마 테스트
```

## 실습에 사용한 모델

| 실습 | 사용한 모델 | 권장 |
|---|---|---|
| [실습 05] 습관 트래커 | GPT-6.1-Sol(medium) | GPT-6.1-Sol(medium), 날짜 계산이 복잡하면 high |
| 05.4 다크 모드(메타 프롬프트) | GPT-6.1-Sol(medium) | 같음 |
