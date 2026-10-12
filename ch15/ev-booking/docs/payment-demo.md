# 5180 토스 결제 시연

## 실행

```sh
npm run demo:payment
```

접속: http://localhost:5180 . 루프백에만 연결하며 외부 배포하지 않는다.
프로젝트 `.env`의 `TOSS_CLIENT_KEY`·`TOSS_SECRET_KEY`는 위젯용 테스트 키만 허용한다.
키 값·인증 헤더·원문 응답은 출력하지 않는다. 클라이언트 키는 SDK 초기화에만 전달하고
시크릿 키는 서버에만 둔다. 키 파일이나 `.local/` 기록은 Git에서 제외한다.

## 시연 범위

- 원본 국회도서관(`ME183103`, 충전기 `02`, DC콤보 100kW)을 선택했다.
  `status.json`의 유효한 최신 갱신분을 병합하고 명확한 자격 후보만 선택한다.
- 첫 주문의 예약 구간은 서울 시간 2026-10-13 10:30~11:30이다.
  새 주문은 서버 시연 현재 시각 약 24시간 뒤의 00/30분 시작으로 생성한다.
- 한 테스트 운전자의 단일 주문을 공유하며 실제 계정 로그인·검색·자격 판정 앱을 대신하지 않는다.
- 주문 페이지 진입 시 10분 임시 점유를 저장한다. 페이지를 다시 열어도 유효 주문의
  기한은 연장하지 않는다. 미승인 주문이 만료한 뒤 페이지를 다시 열면 새 시연 주문을 만든다.
- `/success`에서 서버가 저장 주문의 금액을 검증한 뒤 토스 승인 API에 요청한다.
  검증한 카드·KRW·DONE 응답을 기존 `reduceVerifiedPaymentApproval`에 전달한다.
- 승인 전 외부 요청 진행 상태를 먼저 저장하며 같은 주문의 HTTP 처리를 직렬화한다.
  처리 후 재조회는 저장된 결과만 표시한다. 요청 중 종료·통신 불명은 자동 재승인하지 않는다.
- 늦은 승인 보상 환불은 토스 테스트 취소 API를 한 번 호출한다. 완료 응답을 검증한 경우만
  환불 완료로 표시한다. 실패·응답 불명은 사용자 지시대로 `운영자 확인 필요`이며 자동 재시도 없음.
- 시연 상태는 `.local/payment-demo/`에 보관한다. 서버 재시작으로 주문을 초기화하지 않는다.
  확정 또는 운영자 확인 필요 상태에서 다음 진행 중 예약을 추가하지 않는다.

## 이번 검증

사용자는 이 시연의 통합 테스트를 화면 확인으로 대체하도록 명시했다.
기존 테스트·훅·헌법 전역 설정은 변경하지 않았다. Browser 스킬/플러그인이 없어
연결된 Playwright 도구로 확인했다.

| 확인 | 결과 | 근거와 한계 |
|---|---|---|
| 5180 서버 시작·주문 정보 | PASS | 국회도서관·서울 예약 구간·3,000원 렌더링 |
| 토스 실제 테스트 위젯 | PASS | 결제수단·약관 iframe 로딩, 테스트 환경 안내 |
| 카드 외 수단 차단 | PASS | 퀵계좌이체 선택 후 버튼 클릭 시 카드 선택 안내, 인증 요청 없음 |
| 카드 선택·결제창 진입 | PASS | 신용·체크카드→국민→결제 버튼, 토스 sandbox 카드 인증창 열림 |
| 국민카드 인증 완료 | BLOCKED | 검증 브라우저에서 customer.kbcard.com DNS 연결 실패. 키 인증 실패로 단정하지 않음 |
| 실제 토스 승인·환불 완료 | NOT_RUN | 인증 완료 결과를 얻지 못해 서버 승인·취소 API를 호출하지 않음 |
| 금액 조작 거절 | PASS | 브라우저에서 저장 주문에 100원 요청 → HTTP 400 INVALID_ORDER_AMOUNT. 승인 API 전 거절 |
| 미완료 결과 화면 | PASS | `/result`는 예약 0건·승인 0원·완료 확인 없음 표시 |
| 모바일 | PASS | 390×844, 가로 넘침 없음. 스크롤 후 실제 위젯·약관·버튼 확인 |
| 주문 화면 콘솔 | PASS | 최종 재방문에서 오류·경고 0. 초기 favicon 404는 인라인 favicon 추가로 해소 |
| 기존 규칙 회귀 | PASS | `npm run test:rules`, 8개 파일 156개 통과. 새 통합 자동 테스트가 아님 |
| 프로젝트 타입 | PASS | `npm run typecheck`. 이 명령의 기존 검사 범위는 규칙·테스트·설정 |
| 새 서버 타입 | PASS | `tsc --ignoreConfig --noEmit --strict --types node --target ES2023 --module NodeNext --moduleResolution NodeNext --allowImportingTsExtensions --skipLibCheck src/demo/server.ts src/rules/demo-order.ts` |
| 구문·공백 | PASS | Node 구문 검사 및 git diff --check |
| 승인 완료·환불 실패 결과 화면 실관찰 | NOT_RUN | 코드 연결만 구현. 실제 응답이 없는 상태를 성공 화면으로 꾸미지 않음 |

토스 연동 근거: [위젯 연동 가이드](https://docs.tosspayments.com/guides/v2/payment-widget/integration),
[SDK](https://docs.tosspayments.com/sdk/v2/js/payment-widget),
[승인·취소 API](https://docs.tosspayments.com/reference).

웹훅 실수신·전체 예약 서비스·권한·전체 T-47 검증은 이번 완료 범위가 아니다.

## 사용자 시연 후 실패 안내 수정

원인: `/fail`이 토스 반환 URL의 `code`·`message`를 사용하지 않고
`history.replaceState`로 삭제했다. SDK catch도 사유를 표시하지 않았고,
서버 승인·환불 오류는 `code`만 저장했다.

- 반환 필드를 먼저 정리해 실패 코드·사유를 텍스트로 표시한다.
- 화면에 표시할 정보만 현재 브라우저 history state에 보관한다.
  URL의 오류 원문을 제거해도 새로고침 표시가 유지된다.
- 없는 실패 정보는 확인할 코드/사유 없음으로 표시한다. 이전 버전이 이미 지운 정보는 복구하지 못한다.
- 주문 정보가 없거나 조회 실패해도 실패 안내는 표시하고 불완전한 주문 요약은 숨긴다.
- SDK 실패와 서버 승인·환불 API의 실패 사유에도 같은 화면 표시 보호를 적용한다.
- API 키·인증 헤더·토큰·URL은 숨기고 메시지는 최대 500자로 제한한다.
  HTML처럼 생긴 메시지도 textContent로 표시한다. 실패 정보로 예약·결제 상태를 변경하지 않는다.

| 확인 | 결과 | 범위 |
|---|---|---|
| 수정 전 실패 정보 누락 재현 | FAIL (수정 전 증거) | 모의 반환 URL에 PAY_PROCESS_CANCELED·취소 메시지를 넣어도 일반 안내만 표시됨 |
| 코드·사유 표시 및 새로고침 | PASS | 같은 모의 반환 URL로 화면 확인. URL 정리 후에도 코드·사유 유지 |
| 실제 토스 인증 취소 응답 | PASS | 국민카드 선택→sandbox 인증창→인증 취소. PAY_PROCESS_CANCELED / 사용자가 결제를 취소하였습니다 표시, 새로고침 유지 |
| HTML·토큰 처리 | PASS | 모의 메시지의 img 태그는 DOM 요소로 생성되지 않음. 토큰 값은 숨김 |
| 실패 정보·주문번호 누락 | PASS | 코드/사유 확인 불가 표시, 불완전한 주문 요약은 숨김 |
| 국민카드 인증 호스트 | BLOCKED | 로컬 DNS lookup customer.kbcard.com → ENOTFOUND. 토스 sandbox 호스트는 조회 성공 |
| 인증·승인·환불 실제 완료 | NOT_RUN | 외부 카드사 인증 연결이 해결됐다는 주장은 하지 않음 |

모의 callback 검사와 실제 인증 취소 응답 확인은 위 표에서 구분했다.
실제 인증 취소는 결제 승인·환불 취소 API 완료를 의미하지 않는다.
이 컴퓨터의 국민카드 호스트 연결 실패는 확인했으나 카드사 장애의 원인·전체 영향 범위는 확인하지 않았다.
카드사 주소를 바꾸거나 DNS·인증서·브라우저 보안 설정을 변경하지 않았다.
후속 실패는 화면에서 받은 토스 코드·사유로 확인할 수 있다.
기존 규칙 회귀 8개 파일·156개 PASS. 새 서버 타입·브라우저 JavaScript 구문·공백 검사 PASS.
서버 승인·환불 오류 사유는 전달 경로를 수정하고 정적으로 확인했으며 실제 실패 응답 검증은 NOT_RUN이다.
반환 URL 필드와 SDK 실패 계약 근거: [토스 위젯 연동](https://docs.tosspayments.com/guides/v2/payment-widget/integration),
[SDK](https://docs.tosspayments.com/sdk/v2/js/payment-widget).
