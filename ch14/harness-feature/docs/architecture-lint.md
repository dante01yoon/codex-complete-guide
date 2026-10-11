# 화면 아키텍처 검사

`npm run lint:arch`는 두 가지 화면 규칙을 정적으로 검사한다. 위반 또는 파싱 실패 시 종료 코드 1, 통과 시 0을 반환한다. 메시지는 `파일:줄:열 [규칙 ID] 이유`와 `수정:` 안내로 구성된다.

- `ARCH-RULES`: 금액·시간의 산술, 숫자 경계 비교, 복합 대입·증감, 반올림/최솟값/최댓값, Date 변경 메서드, 숫자 결과를 선택하는 조건식을 화면에서 만들지 않는다. `src/rules`의 순수 함수를 호출하고 결과만 표시한다. 서버 기준 시각을 함수 인자로 전달한다. 근거: PRD 4.2, C-10, T-22·T-25·T-35·T-37, AC-07·AC-08·AC-11.
- `ARCH-CLOCK`: 인자 없는 `new Date()`, `Date()`, `Date.now`의 호출·참조·구조 분해를 금지한다. `window.Date`, `globalThis.Date`, `self.Date`와 변경되지 않는 로컬 Date 별칭도 검사한다. 서버가 제공한 기준 시각을 사용한다. 기준 시각 누락 시 로컬 시각으로 대체하지 않는다. 근거: PRD 4.2, T-05·T-45, AC-17-1·AC-17-2.

## 범위와 구현

`ui/`, `public/`, `src/` 아래 JS·TS·JSX·TSX·MJS·CJS·MTS·CTS와 HTML을 검사한다. 화면용 공용 함수도 `src/`에 있으면 검사한다. `src/rules/`, 서버 전용 `src/server/`와 `*.server.*`, 타입 선언 `*.d.ts`는 제외한다. 루트의 개발 도구 `scripts/`와 `tests/`는 검사하지 않는다. 서버 전용 모듈을 화면에서 import하지 않는다.

JS/TS는 Babel AST, HTML은 parse5로 파싱하여 실행 가능한 인라인 script와 이벤트 속성을 검사한다. HTML의 원래 줄·열을 보고한다. JSON script, HTML/JS 주석과 코드처럼 보이는 문자열은 실행 코드로 검사하지 않는다. Vue/Svelte 파일은 조용히 통과시키지 않고 파서 확장 안내와 함께 실패한다. 새 화면 경로·형식은 검사기 범위를 함께 갱신한다.

금액·시간 식별자는 camelCase/snake_case의 `refund`, `deposit`, `amount`, `price`, `cost`, `fee`, `won`, `money`, `now`, `time`, `date`, `timestamp`, `deadline`, `expire`, `expiry`, `remaining`, `minute`, `second`, `hour`, `day`, `duration`, `start`, `end`, `ms`, `at` 및 대응 한글 이름으로 인식한다. 간단한 대입·구조 분해 별칭은 렉시컬 바인딩을 따라 추적한다. `getTime()` 등의 Date 숫자 변환도 검사한다.

도메인 이름과 무관한 레이아웃 산술, 문자열 라벨 연결, `toLocaleString()` 같은 표시 변환, `new Date(serverNowMs)` 및 규칙 함수 결과의 표시는 허용한다. 문자열 상태값 비교도 허용한다.

정적 검사는 모든 의미를 증명하지 않는다. 임의 이름만 쓴 외부 함수, 동적 프로퍼티, 런타임 생성 코드, 파일 사이의 별칭은 완전히 추적하지 않는다. 금액·시간 이름을 명확히 유지하고 코드 리뷰에서도 함수 출처와 서버 기준 시각의 전달 경로를 확인한다. 통과는 제품 AC 전체 통과나 서버 시계 구현 완료를 뜻하지 않는다.

## 허용 예

```ts
import { canCheckInGeneralReservation } from '../src/rules/index.js';
const canCheckIn = canCheckInGeneralReservation(reservation.startMs, serverNowMs);
const clockLabel = new Date(serverNowMs).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });
const refundLabel = result.state.refundAmount.toLocaleString('ko-KR');
```

규칙 함수가 없으면 기존 화면에 계산식을 복사하지 않고 별도 규칙 작업으로 보고한다. `src/rules`와 `tests` 변경 금지 요청에서는 이 린트를 이유로 두 폴더를 수정하지 않는다.

## 검증 기록 (2026-10-11)

- `PASS`: 임시 `ui/arch-invalid.ts`·`ui/arch-invalid.html`로 위반 20건과 종료 코드 1 확인. 파일·원본 줄 번호, 규칙 ID, 각 진단의 수정 안내를 자동 assertion으로 확인했다. 금액·남은 분·시간 경계, 대입·증감·반올림, Date 별칭·구조 분해, HTML script·onclick을 포함한다. 의도된 위반 실행은 `FAIL`을 출력했고 검증은 기대대로 통과했다.
- `PASS`: 임시 `ui/arch-valid.tsx`의 규칙 함수 호출, 서버 시각 표시, 금액 표시, 일반 산술, 문자열·주석, 별도 스코프의 같은 변수 이름, 로컬 Date 매개변수에 진단 없음. HTML의 JSON script·주석에도 진단 없음.
- 임시 예제 세 파일은 확인 후 삭제했다. `PASS`: 삭제 후 `npm run lint:arch` — 현재 화면 1개 파일, 위반 0건.
- `PASS`: `npm run typecheck`, `npm run test:rules` — 3개 파일/55개 테스트, `git diff -- src/rules tests` — 변경 없음.
- `PASS`: `npm run check:ui` — 기존 프로젝트 서버 재사용, 390×844·1280×900 캡처 직접 확인, 브라우저 오류 0건. 상세 증거는 Git에서 제외한 `artifacts/ui/report.json`과 이미지에 있다.
- 제품 흐름 AC와 토스 테스트 실연결은 `NOT_RUN`. 이번 작업은 화면 규칙을 지키기 위한 개발 도구이며 `src/rules`, `tests`, 현재 화면, 훅을 수정하지 않았다.
