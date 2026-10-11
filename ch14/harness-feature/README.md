# harness-feature: 하네스로 기능 만들기

『코덱스 완벽 가이드』 14장 [실습 14] ‘하네스로 기능 만들기’(08~10단계)를 마친 상태입니다. `harness-on`(실습 14를 마친 상태)에서 시작해, 코덱스가 자기 화면을 보는 도구와 맞춤 린트를 만들고 그 위에서 ‘내 예약’ 화면을 만들었습니다. 챗GPT 앱(macOS)과 GPT-6.1-Sol(medium), 권한은 Full access로 진행했습니다. 작성 기준일은 2026년 10월 11일입니다.

| 파일 | 내용 |
|---|---|
| `scripts/dev.mjs` | `npm run dev`. 127.0.0.1:4180에 서버를 띄우고 로그를 `artifacts/server.log`에 남깁니다 |
| `scripts/check-ui.mjs`, `scripts/ui-pages.json` | `npm run check:ui`. Playwright로 화면을 휴대폰(390x844)·데스크톱(1280x900)으로 찍고 콘솔 오류와 서버 로그를 요약합니다 |
| `scripts/lint-arch.mjs`, `docs/architecture-lint.md` | `npm run lint:arch`. 화면 코드에서 금액·시간을 계산하거나 현재 시각을 직접 얻으면 위치·이유·고치는 법을 출력합니다 |
| `ui/index.html`, `src/server/demo-reservations.mjs` | 내 예약 화면과 시연용 예약 세 건, 서버 메모리의 모의 취소 |
| `docs/my-reservations-plan.md` | 화면 구성과 검증 기록 |

## 실행

```sh
npm ci
npx playwright install chromium
npm run dev          # http://127.0.0.1:4180/my-reservations
npm run check:ui
npm run lint:arch
```

- 시연 예약 세 건은 화면 시연 전용입니다. 운전자당 1건 제한(AC-03-2)과 정각·30분 시작 제한(AC-04-2)의 예외이며, 취소·환불은 서버 메모리의 모의 처리입니다. 실제 토스 환불이 아닙니다.
- 훅(`.codex/hooks.json`)은 앱의 [Settings > Hooks]에서 신뢰해야 동작합니다. `hooks.json`은 `git rev-parse --show-toplevel`로 경로를 찾으므로 이 폴더를 따로 꺼내 `git init` 후 사용하세요.

## 보낸 요청

### 08단계

```text
이제 이 서비스에 화면을 붙일 거야. 그 전에 코덱스가 자기가 만든 화면을 직접 보고 확인할 수 있는 도구부터 만들어 줘. 첫째, npm run dev로 로컬 서버(127.0.0.1:4180)를 띄우고 서버 로그는 artifacts/server.log에 남겨. 둘째, npm run check:ui는 서버를 띄운 뒤 Playwright로 주요 화면을 휴대폰(390x844)과 데스크톱(1280x900) 크기로 열어 스크린샷을 artifacts/ui에 저장하고, 브라우저 콘솔 오류와 서버 로그 마지막 30줄을 모아 요약을 출력해. artifacts 폴더는 git에 올리지 마. 셋째, AGENTS.md에 이 두 명령을 언제 쓰는지 짧게 적어 줘. 아직 기능 화면은 만들지 말고, 빈 첫 화면 하나로 도구가 동작하는지 확인한 뒤 커밋해 줘. src/rules와 tests는 고치지 마.
```

### 09단계

```text
앞으로 화면을 만들 때 지켜야 할 아키텍처 규칙을 맞춤 린트로 만들어 줘. 규칙은 두 가지야. 첫째, 금액과 시간 규칙의 판단은 src/rules에서만 한다. 화면 코드는 src/rules의 함수를 불러 결과만 보여 주고, 환불액이나 남은 분을 직접 계산하면 안 된다. 둘째, 화면 코드에서 new Date()나 Date.now()로 현재 시각을 직접 얻지 않고, 서버가 정한 기준 시각을 받아서 쓴다. npm run lint:arch로 실행하고, 규칙을 어기면 어느 파일 몇째 줄이 왜 문제인지와 어떻게 고치면 되는지를 코덱스가 읽고 바로 고칠 수 있게 메시지를 써 줘. 규칙을 어기는 예제 파일을 잠깐 만들어 메시지가 제대로 나오는지 확인하고, 확인한 뒤에는 지워. AGENTS.md의 화면 작업 안내에 이 명령도 추가하고, 지금 코드에서 통과하는지 확인한 뒤 커밋해 줘. src/rules와 tests는 고치지 마.
```

훅이 tests 경로가 든 읽기 명령을 막아 코덱스가 BLOCKED로 멈췄을 때 보낸 답:

```text
확인했어. 이건 읽기만 하는 명령인데 && 로 묶어서 훅이 보수적으로 막은 거야. 훅은 그대로 두고, tests 경로가 들어간 확인은 cat, git diff 같은 단순 명령 하나씩으로 나눠서 실행해. 그렇게 해서 린트 작업을 이어서 끝내 줘.
```

### 10단계

```text
이제 운전자가 쓰는 내 예약 화면을 만들어 줘. 확정된 예약 목록을 보여 주고, 예약마다 지금 취소하면 돌려받는 금액과 시작까지 남은 시간을 표시해. 금액과 시간 판단은 src/rules의 기존 함수만 써. 시연용 예약 세 개를 서버 메모리에 만들어 두되 시작까지 2시간 넘게, 1시간, 20분 남은 것으로 해. 이 세 건은 화면 시연 전용 데이터라서 운전자당 1건 제한(AC-03-2)과 정각·30분 시작 제한(AC-04-2)의 예외로 두고, 화면과 문서에 시연 데이터라고 표시해. 취소 버튼을 누르면 확인을 받은 뒤 서버 메모리에서 모의 취소하고 환불액을 보여 줘. 실제 토스 환불이 아니라는 것도 화면에 표시해. 다 만들면 npm run lint:arch와 npm run check:ui를 돌리고, 스크린샷을 직접 열어 확인해. 이상한 곳이 있으면 고치고 다시 확인한 뒤 커밋하고, 무엇을 보고 무엇을 고쳤는지 정리해 줘.
```

헌법(테스트 먼저)과 훅(테스트 파일 보호)이 부딪친다고 코덱스가 물었을 때 보낸 답:

```text
승인할게. 새 정책 규칙은 만들지 않고 src/rules의 기존 함수만 부르니까 새 규칙 테스트는 만들지 않아도 돼. 대신 화면은 npm run lint:arch와 npm run check:ui로 확인하고, 스크린샷을 직접 열어 본 뒤에 끝내. 이상한 곳이 있으면 고치고 다시 확인한 뒤 커밋하고, 무엇을 보고 무엇을 고쳤는지 정리해 줘.
```

## 같은 일을 키트로

화면 확인과 맞춤 린트는 [codex-harness-kit](https://github.com/dante01yoon/codex-harness-kit) 0.2.1의 `harness.py see`, `harness.py lint`로도 쓸 수 있습니다(14.9).
