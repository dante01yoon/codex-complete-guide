# 화면의 금액·시간 경계 린트

2026-10-11 사용자 요청으로 추가한 개발 도구이다. 근거는 AGENTS.md의
`src/rules` 순수 함수 경계, PRD 4.2의 KRW 정수·서울 시연용 시계,
이번 요청의 “화면 현재 시각은 서버에서 받은 값 사용”이다.
제품 정책·조건부 AC·기존 테스트 기대값을 바꾸지 않는다.
T-01/C-10의 합의된 Node.js 24 환경에서 동작하며 화면 프레임워크를 결정하지 않는다.

## 실행

```sh
npm run lint
npm run lint -- --json
npm run lint -- web/index.html src
npm run check:lint
```

기본 범위는 `web/`, `src/` 아래 JS/MJS/CJS/JSX/TS/MTS/CTS/TSX/HTML이다.
HTML의 실행 가능한 script, 이벤트 속성, javascript URL, template도 검사한다.
JSON script·주석·문자열·본문은 실행 코드로 취급하지 않는다.
JSX는 `.jsx`·`.tsx`, TypeScript는 TS 계열 확장자에서 파싱한다.
`src/rules/`는 정책 계산을 허용하되 로컬 시각 생성은 금지한다.
`src/server/`, `src/api/`는 서버 시각 취득을 허용하되 정책 계산은 금지한다.
서버 전용 코드를 화면에 가져오지 않아야 한다. 나머지 src 파일은 화면과 같은 시각 규칙을 적용한다.

`scripts/`는 개발 도구, `demo/`는 별도 하네스 예제여서 기본 범위에서 제외한다.
의존성·빌드·커버리지·산출물 폴더는 순회하지 않는다. 범위 내 심볼릭 링크는
검사 불가로 보고하며, lint 명령에 지정한 파일/폴더는 기본 범위를 대체한다.
도구는 소스 파일을 읽고 파싱할 뿐 실행·수정하지 않는다. 자동 수정으로 제품 정책을 추측하지 않는다.
기존 훅 설정은 변경하지 않았다. 자동 Stop 훅에 이 린트가 연결됐다는 의미는 아니다.

## 오류와 수정

| ID | 검사 | 수정 방향 |
|---|---|---|
| EV001 | `Date.now()`, 인자 없는 `new Date()`, 함수 형태 `Date()`, `performance.now()`, `Temporal.Now.*` 및 정적으로 추적 가능한 별칭 | 서버 응답의 시연용 현재 시각을 인자로 사용. 로컬 시계 fallback·보정 제거 |
| EV002 | 금액·시간의 산술, 증가·복합 대입, 대소 비교, Math 계산, Date setter | `src/rules`의 순수 함수로 이동. 화면/API는 반환값 표시·사용 |
| EV003 | rules 밖의 date-fns/dayjs/moment/luxon/Temporal polyfill 정적·동적 import 및 직접 require | 시간 계산은 rules로 이동. 화면 날짜 표시는 Intl 사용 |
| EV000 | 파싱 실패 | 구문 오류 수정 후 재실행 |

출력은 파일·줄·열·규칙 ID와 한국어 이유·수정 방법을 포함한다.
원본 소스 조각이나 금액 외의 임의 데이터·키 값은 출력하지 않는다.
HTML script의 위치는 원본 HTML 기준, 속성 코드는 해당 속성 시작 위치 기준이다.

```text
web/view.js:1:1 error EV001
  이유: 브라우저 시계는 서버의 서울 시연용 현재 시각과 달라 정책 판정을 어긋나게 합니다.
  수정: 서버 응답의 시연용 현재 시각을 입력으로 받으세요. ...
```

JSON은 `{status, checkedFiles, diagnostics}`이며 각 진단에
`file`, `line`, `column`, `ruleId`, `severity`, `reason`, `fix`가 있다.
파일 접근 등으로 검사를 시작/완료할 수 없으면 `{status: "BLOCKED", message}`를 출력한다.
종료 코드는 PASS `0`, 위반/구문 오류 FAIL `1`, 범위·접근·사용법 문제 BLOCKED `2`이다.
JSON을 직접 파싱할 때는 `node scripts/lint-ui.mjs --json`을 사용한다.

금액·시간은 `amount`, `deposit`, `refund`, `KRW`, `now`, `time`, `deadline`,
`duration`, `minutes`, `seconds`, `Ms`, `At` 등의 이름·필드·계산 결과와
Date API에서 추적한다. camelCase·snake_case·대표 한국어 이름을 인식한다.
변수 별칭·재대입·객체 구조 분해·함수 반환도 동일 파일의 스코프로 추적한다.
`const refundAmount = 3000 / 2`처럼 리터럴만 계산해도 결과 이름을 검사한다.

```js
// 위반: 정책 계산과 현재 시각 생성
const refundAmount = payment.amount / 2;
const nowMs = Date.now();
const endMs = startMs + durationMinutes * 60000;

// 허용: 서버 응답을 받은 뒤 기존 순수 함수에 전달
const result = reduceUserCancellation(input, serverNowMs);
const amountLabel = result.refundAmount.toLocaleString('ko-KR') + '원';
const clockLabel = new Date(serverNowMs).toLocaleString('ko-KR', {
  timeZone: 'Asia/Seoul',
});
```

위 예시는 데이터 전달 원칙이며 실제 서버 시계 API를 추가한 것이 아니다.
API·시계 진행·복구 기능인 T-05/T-45와 C-09는 기존 미확정 범위를 유지한다.

## 한계와 검증 근거

이는 이름·AST·동일 파일 흐름에 기반한 경계 검사이며 전체 프로그램의 타입/의미 증명이 아니다.
금액·시간을 `x`, `y`처럼 의미 없는 이름으로 전달하거나, 다른 파일의 임의 함수·동적 프로퍼티·
동적 모듈 이름·eval에 숨기면 놓칠 수 있다. 반대로 같은 이름의 다른 의미를 보수적으로 잡을 수 있다.
금액과 시각에 명확한 이름을 사용하고, 오류의 이유를 확인해 코드 경계를 수정한다.
규칙 반환값의 서버 출처, KRW 정수 유효성, 시간대·경계의 정확성은 별도 기능 테스트로 검증해야 한다.
린트 통과만으로 서버 시각 수신이나 AC 전체 통과를 주장하지 않는다.

Babel parser/traverse와 parse5를 정확한 버전으로 개발 의존성에 고정했다.
설치된 TypeScript 7.0.2는 JS 파서 API를 제공하지 않아 소스 분석용 파서를 별도로 사용한다.

| 검사 | 실행 결과 |
|---|---|
| `npm run check:lint` | PASS — 71개 도구 검증. 위반·허용·별칭·HTML 위치·JSON·종료 코드 확인 |
| `npm run lint -- --json` | PASS — 현재 소스 6개 파일, 오류 0개 |
| `npm run test:rules` | PASS — 기존 3개 파일, 55개 테스트 |
| `npm run typecheck` | PASS — 타입 오류 없음 |
| 기존 제품 테스트 변경 | 없음 — 이 작업은 AC 기능 구현이 아닌 개발 도구 추가 |
| 서버 시계 수신·브라우저 기능·토스 실연결 | NOT_RUN — 이번 개발 도구 범위 밖 |

`scripts/check-lint.mjs`는 린트 도구의 입력 예제와 임시 파일을 검사한다.
기존 `tests/rules`나 훅 보호 파일을 변경하지 않는다.
