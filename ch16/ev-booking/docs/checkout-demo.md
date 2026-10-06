# 15장 로컬 결제 시연

사용자 후속 요청에 따라 `127.0.0.1:5180` 전용 HTTP 서버를 추가했다. 기존 MCP 링크 문자열 생성과 독립적인 서버 메모리 주문이다. MCP에서 만든 점유·주문·사람 승인 파일은 공유하거나 변경하지 않는다. 기존 tests/ 파일은 변경하지 않았다.

실행: 프로젝트 폴더에서 `npm run demo:checkout`. 브라우저 주소는 `http://127.0.0.1:5180/`이며 현재 메모리 주문의 `/checkout/demo-<UUID>`로 이동한다. 종료는 실행 터미널의 Ctrl+C. 주문은 첫 checkout 방문에 생성되고 점유는 10분이다. 새 시연은 서버를 재시작한다.

- 충전소는 실제 데이터에 연결되지 않은 명시적인 가상 시연 데이터이다. 예약 시간은 서울 기준, 첫 방문에서 2시간 이후의 30분 경계부터 60분이다. 원본 ../ev-map/data는 읽거나 수정하지 않는다.
- Node 내장 HTTP 서버·TypeScript·기존 tsx를 사용하며 프론트엔드는 서버가 반환하는 HTML이다. 로그인 없는 단일 시연 계정이다. HttpOnly 쿠키와 Origin/CSRF 검사로 로컬 승인 요청을 연결하며 실제 로그인 인증으로 주장하지 않는다.
- 프로젝트 .env의 TOSS_CLIENT_KEY(test_gck_)와 TOSS_SECRET_KEY(test_sk_ 또는 test_gsk_)만 읽는다. 클라이언트 키만 위젯에 전달하고 시크릿은 서버에만 둔다. 실제 키는 시작 시 거절한다.
- 위젯은 v2/standard → widgets → setAmount → renderPaymentMethods/renderAgreement → requestPayment 순서다. UI에 다른 수단이 보여도 카드만 결제 요청을 허용하며 기존 confirm.ts도 카드/DONE을 검사한다.
- /success는 리다이렉트 금액을 서버 주문과 대조하는 confirmPayment를 호출한다. 직렬 메모리 transaction과 고정 멱등키로 같은 승인을 중복 반영하지 않는다. 성공 URL 도착만으로 확정하지 않는다.
- 승인 API와 취소 API는 https://api.tosspayments.com/v1/payments에 테스트 키로 요청한다. /confirm 승인, /<paymentKey>/cancel 보상 환불을 사용한다. 별도 모의 승인 응답을 만들지 않는다. 기한·환불 재시도는 기존 confirm.ts에 맡긴다. getPayment 어댑터도 구현했지만 공개 웹훅 엔드포인트는 추가하지 않았다.
- /fail은 사유·코드를 HTML 이스케이프해 표시한다. 서버 승인 실패는 /success의 결과 영역에서 사유와 미확정을 표시한다. 승인 확인한 금액·수단·환불을 구분한다. 키·원문 API 오류·paymentKey는 로그나 결과 화면에 출력하지 않는다.

관련 범위: US-05/06, T-15·16·17·19·20·47의 시연 연결 부분. 실제 로그인·원본 충전소·MCP 주문 통합 및 전체 작업의 완료를 의미하지 않는다. C-07의 창 닫기 조기 해제·재시도 정책은 추가하지 않았다.

| 검증 | 결과 | 근거/범위 |
|---|---|---|
| 기존 자동 테스트 | PASS | npx vitest run, 8파일 171개 통과. 신규 HTTP 서버에 대한 테스트 우선 작성·실패 확인은 수행하지 않음 |
| 타입 검사 | PASS | npm run typecheck, 새 src/payments/demo-server.ts 포함. 최초 문법 오류 수정 후 통과 |
| 기존 테스트 불변 | PASS | git diff --exit-code -- tests 종료 0 |
| 위젯 실제 브라우저 렌더 (AC-05-1 일부) | PASS | 토스 v2 iframe, 테스트 환경 안내, 결제수단·약관·3000원 버튼 확인 |
| 실패/불명 주문/CSRF HTTP 확인 (AC-05-6 일부) | PASS | /fail 200·사유 이스케이프, 불명 /success 400, 토큰 없는 /api/confirm 403 |
| 실제 테스트 카드 인증→승인→확정/환불 (T-47) | NOT_RUN | 사용자가 브라우저에서 진행할 실습. 모의 테스트 통과와 구분 |

공식 근거: [토스 v2 위젯 API](https://docs.tosspayments.com/sdk/v2/js/payment-widget), [승인·취소 API](https://docs.tosspayments.com/reference). 신규 HTTP 시연은 기존 tests/를 고치지 말라는 이번 사용자 범위를 따랐으며 헌법 III의 신규 테스트 확인·RED 절차를 충족했다고 보고하지 않는다.

## 카드 선택 오류 수정 (2026-10-06)

신용·체크카드와 국민카드를 선택해도 CARD_ONLY 안내가 표시되는 오류를 확인했다. 공식 @tosspayments/tosspayments-sdk의 타입 선언은 `getSelectedPaymentMethod: () => Promise<WidgetSelectedPaymentMethod>`이다. 기존 코드는 await 없이 Promise의 code를 읽어 undefined를 CARD와 비교했다. await를 추가했으며 카드 제한은 유지했다.

원래 주문 URL로 재시작할 때는 `BOOKING_DEMO_ORDER_ID=demo-b14f43a3-a995-4e07-96fe-a6f19f57ff2c npm run demo:checkout`을 사용한다. demo-UUID 형식을 검증한다. 주소만 재사용하며 이전 메모리 주문·시각·세션을 복원하는 기능은 아니다. 새 프로세스의 첫 방문에 시연 주문과 10분 점유를 새로 만든다.

| 검증 | 결과 | 근거 |
|---|---|---|
| 단독 재현 (수정 전) | FAIL | 소스의 실제 선택 검사 구문에 비동기 CARD 결과를 주입하면 false, 종료 1 |
| 같은 검사 (수정 후) | PASS | 비동기 CARD=true, TRANSFER=false, TOSSPAY=false를 실제 소스 구문으로 검증 |
| 기존 테스트·타입 검사 | PASS | 171/171, npm run typecheck 종료 0. tests 불변 |
| 동일 URL 서버 재시작 | PASS | 지정 주문번호로 127.0.0.1:5180 재시작하고 원래 브라우저에서 재로딩 |
| 국민카드 선택→테스트 결제창 진입 | PASS | 실제 브라우저 클릭으로 토스 sandbox 결제하기 페이지와 국민카드 인증 iframe 진입. CARD_ONLY 없음 |
| 국민카드 인증 화면 로딩 | BLOCKED | iframe의 customer.kbcard.com DNS 조회 실패 화면을 실제 관찰. 인증 완료·승인 요청·예약 확정은 검증하지 않음 |

인증이나 최종 결제를 완료하지 않고 브라우저를 원래 checkout 주소로 돌려놓았다. 외부 인증 화면의 연결 실패를 카드 검사 수정의 실패나 승인 성공으로 보고하지 않는다.
