# MCP 결제 링크 HTTP 연결 검증

기준 커밋: `ef6bbc8` (16장 09단계 계획·사용자 확인 테스트).
범위: T-52·56·57의 후속 HTTP 연결, 아래 T-58. 전체 예약 서비스·토스 실승인 완료를 뜻하지 않는다.

## 사용자 확인·Red·테스트 불변

- 사용자가 신규12개 테스트를 확인하고 스위치를 끈 뒤 구현을 요청했다.
- 최초 조회 때 계획·테스트가 staged였으나, 사용자 커밋 완료 후 `ef6bbc8`을 확인했다.
- 직접 Red: `npm run test:rules -- tests/mcp/payment-page.test.ts`, 09:42:01, exit1/12개 FAIL.
  원인은 제품 진입점 `src/demo/payment-server.ts` 누락 assertion이었다. 환경·키 오류가 아니다.
- 앞선 Stop 훅도 같은12개 FAIL/기존218개 PASS/타입 PASS를 보고했다.
  사용자 확인 전 훅 실행을 사용자 승인으로 대신하지 않았다.
- `git hash-object` 조회가 가드에 차단되어 중단했다. 사용자가 `git diff`로 확인하며 재개하도록
  명시 지시한 뒤 `git diff HEAD -- tests`의 빈 diff를 확인했다. 가드/스위치는 수정하지 않았다.
- 제품 생성용 복합 셸이 형식 때문에만 차단됐을 때는 AGENTS.md의 예외에 따라 같은 대상의
  변경을 파일별 단일 apply_patch 호출로 나눴다. 실제 승인 파일·키 파일은 수정하지 않았다.

## 구현

- `src/demo/payment-server.ts`: import 부작용 없는 서버 factory, 신뢰된 root·actor·시계,
  점유/승인 읽기, `/payment/<holdId>`와 `/api/payment/<holdId>` 연결, 기존 주문 파일에 한 번만 저장.
- 기존 `.local/payment-demo/orders.json` 주문·customerKey·driver 정보와 승인·환불 처리 경로를 유지한다.
  원래 hold 생성/만료·충전기·선택 커넥터·시간·예약금3000원/KRW를 사용한다.
- 미승인·잘못된 승인·소유자 불일치·없는 점유·정확히 만료부터 페이지와 API를 거절한다.
  거절 HTML에는 토스 SDK·결제 위젯/버튼이 없으며 고정 한국어 사유와 코드가 있다.
- `src/demo/public/`: 링크 주문 조회, 실제 길이/커넥터 표시, 반환 주문의 holdId로 결제 직전 재검사,
  만료/승인 거절 시 결제 UI를 숨기고 이유 표시. 기존 성공·실패·결과 화면은 같은 주문을 조회한다.
- `src/rules/demo-order.ts`: 기존 자격/커넥터/겹침 함수를 재사용한 공통 확정 전 자리 검사.
  기존 `/` 주문과 MCP 주문 모두 적용하며 다른 유효 MCP 점유와 확정/응답 불명 주문을 확인한다.
  기존 reducer의 DONE·금액·기한·중복 보호·늦은 승인 전액 보상 경로를 유지한다.
- `src/demo/server.ts`: 테스트 키 로딩·실제 테스트 provider·5180 listener만 담당.
  package의 실행 명령은 기존 설치된 tsx로 .ts/.js 모듈을 연결한다.
- `src/mcp/environment.ts`: 기본 링크 주소를 시연 서버의 5180에 맞췄다.
  명시적인 EV_BOOKING_LINK_BASE_URL은 유지하고 사용자 전역 설정은 변경하지 않는다.

## 자동 검사와 리뷰

| 검사 | 결과 | 범위 |
|---|---|---|
| 신규 HTTP 테스트 | PASS | 09:50:48, 12/12, 실제 루프백 HTTP·임시 root |
| 전체 테스트 | PASS | 09:51:28, 230/230 |
| 리뷰 수정 후 전체 테스트 | PASS | 09:58:32, 230/230 |
| npm run typecheck | PASS | 기존 설정의 rules/MCP/CLI/테스트 정적 검사 |
| 별도 demo TypeScript 검사 | PASS | 아래 명령으로 기존 설정에 없는 demo entry와 의존 모듈까지 검사 |
| app.js 구문 검사 | PASS | node --check |
| 읽기 전용 리뷰 | PASS | reviewer 역할의 재리뷰, 지적2건 수정 후 추가 지적 없음 |

별도 정적 검사 명령:

```sh
npx tsc --ignoreConfig --noEmit --allowImportingTsExtensions --target ES2023 --module NodeNext --strict --types node --skipLibCheck src/demo/server.ts
node --check src/demo/public/app.js
```

리뷰 지적과 수정:

1. 기존 `/` 주문은 공통 자리 검사에서 빠져 MCP 주문과 중복 확정될 수 있었다.
   두 경로의 확정 전 검사를 통일하고 다른 유효 MCP 점유도 순수 규칙에서 검사했다.
2. `/`가 MCP 주문을 반환하면 URL에 holdId가 없어 클릭 전 재검사가 빠졌다.
   URL만 보지 않고 반환 주문의 holdId로 재검사하도록 고쳤다.

이 수정의 추가 사례는 읽기 리뷰와 아래 브라우저 확인 근거로 구분한다.
사용자 확인된12개 테스트는 수정하지 않았다.

## 브라우저 확인

Browser plugin/skill 미제공으로 Playwright를 사용했다.
격리 임시 프로젝트의 loopback 5182, desktop1280×800/mobile390×844에서 확인했다.
승인 fixture는 임시 root에서만 만들었으며 실제 프로젝트 승인 폴더에는 쓰지 않았다.
토스 테스트 위젯 렌더링에는 공개 테스트 clientKey만 사용했다.
승인/환불 adapter는 항상 거절하는 fixture이며 종료 로그에서 providerCalls=0을 확인했다.

| 흐름 | 상태 | 실행 근거 |
|---|---|---|
| 승인+유효 링크 → 주문·위젯 | PASS | NACS·30분·3000원·해당 충전소, 토스 테스트 카드 선택 UI 표시 |
| 반복 조회 | PASS | 같은 orderId·만료, 금액3000원 유지 |
| 미승인 링크 | PASS | HTTP403, 승인 사유, SDK/결제 버튼 없음 |
| 이미 만료한 링크 | PASS | HTTP410, 만료 사유, SDK/결제 버튼 없음 |
| 화면 진입 후 시계가 정확히 만료 → 결제 클릭 | PASS | 조회 API410, HOLD_EXPIRED 표시, 위젯/버튼 숨김·승인 호출 없음 |
| `/`에서 MCP 주문 표시 → fixture 승인 제거 → 결제 클릭 | PASS | APPROVAL_REQUIRED 표시, 위젯/버튼 숨김 |
| 의미 있는 화면·제목·오류 overlay | PASS | 주문/거절 화면 DOM·접근성 snapshot 확인, 정상 화면 console error0 |
| 가로 넘침 | PASS(측정 부분) | 두 viewport에서 scrollWidth<=innerWidth; 픽셀 시각 검수와 구분 |
| 스크린샷 저장 | BLOCKED | Playwright가 /tmp 저장을 allowed roots 제약으로 거절. 캡처 기반 시각 검수는 미완료 |
| 실제 5180 서버 시작·없는 점유 안내 | PASS | npm run demo:payment, HTTP404 UNKNOWN_HOLD·이유·결제 UI 없음 |
| 실제 카드 DONE 승인·환불 | NOT_RUN | 외부 승인/취소 API 호출0회. T-47 완료 아님 |

403/410/404 화면의 console에는 해당 HTTP 거절 응답에 따른 브라우저 resource 메시지만 있었다.
정상 주문 화면에는 app 오류가 없었고 프레임워크 overlay도 없었다.
브라우저 snapshot은 도구의 기본 출력 폴더에 남는다. 추가 보고서나 스크린샷을 저장소에 만들지 않았다.
두 임시 QA 서버는 종료하고 임시 root를 삭제했다. 실제 5180 서버는 로컬 시연을 위해 실행 중이다.

## 실행·완료 범위

```sh
npm run demo:payment
```

MCP와 시연 서버는 같은 EV_BOOKING_ROOT, EV_BOOKING_ACTOR_ID, EV_BOOKING_SOURCE_DATA_DIR,
EV_BOOKING_NOW_MS(주입할 경우)를 사용해야 한다. 기본 링크는 http://127.0.0.1:5180이다.
사용자가 CLI로 승인한 유효 점유의 반환 주소를 열면 해당 주문이 표시된다.
10분 기한은 approve·링크·페이지 재조회로 연장되지 않는다.

기존 웹훅·전체 계정 로그인·대기·운영자·복구·다중 프로세스 저장 잠금은 확장하지 않았다.
MCP 검색/점유 저장소를 전체 확정 예약 저장소로 통합한 작업도 아니다.
그 범위의 서비스 완료나 실제 충전소 이용·금전 결제를 주장하지 않는다.
