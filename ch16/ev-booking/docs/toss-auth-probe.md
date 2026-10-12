# 토스 테스트 서버 인증 연결 확인

사용자 직접 요청으로 제품 구현과 별개인 연결 진단을 수행했다.
이 요청은 기존 PRD 4.2.3·T-50의 로컬 fixture 검증 범위와 별도이며,
T-47의 실제 결제 승인·환불 완료를 의미하지 않는다. 제품 정책·테스트는 변경하지 않았다.

## 재실행

Node.js 24에서 프로젝트 루트 기준으로 실행한다.

```sh
node scripts/toss-auth-probe.mjs
```

스크립트는 프로젝트 `.env`의 `TOSS_SECRET_KEY`를 직접 읽는다.
`TOSS_CLIENT_KEY`는 서버 승인 인증에 사용하지 않는다.
공식 테스트 시크릿 키 형식 두 종류만 허용하며 키 값·인증 헤더·원문 응답·예외를 출력하지 않는다.
각 실행에서 무작위의 존재하지 않는 paymentKey·orderId와 정수 금액 3,000원으로
`https://api.tosspayments.com/v1/payments/confirm`에 POST를 최대 한 번 보낸다.
자동 재시도·리다이렉트 추적은 없고 전체 요청 제한 시간은 15초다.
앱 예약·주문을 생성하지 않으며 실제 결제 정보 입력을 받지 않는다.

종료 코드 0은 HTTP 404와 `NOT_FOUND_PAYMENT`가 함께 확인된 경우다.
이 결과는 인증 이후 없는 결제가 거절된 것으로 해석하는 제한적인 진단이다.
종료 코드 1은 사전 조건 미충족, 통신 실패, 인증 오류 또는 예상 외 응답이다.
현재 스크립트는 응답의 `code` 값만 출력한다. 대문자·숫자·밑줄로 된
최대 128자 토큰만 출력하고, code가 없거나 안전한 형식이 아니면 아무것도 출력하지 않는다.
다른 응답 필드·키·인증 헤더·원문·실행 요약은 출력하지 않는다.

## 이번 실행 결과

실행 시각: 2026-10-11 21:09:16 EDT (2026-10-12T01:09:16.680Z).

| 검사 | 상태 | 근거 |
|---|---|---|
| 스크립트 구문 | PASS | `node --check scripts/toss-auth-probe.mjs`, 종료 코드 0 |
| 토스 테스트 실연결 | PASS | POST 1회, HTTP 404 수신 |
| 인증 통과 기대 응답 검사 | FAIL | 허용 목록에 해당하는 오류 코드 확인 실패, `UNEXPECTED_RESPONSE`; 인증 통과·실패 원인은 확정하지 못함 |
| 실제 테스트 결제 승인·환불·웹훅·브라우저 | NOT_RUN | 없는 결제에 대한 연결 진단만 수행 |

첫 로컬 실행은 키 형식 허용 목록이 좁아 요청 0회로 중단됐다.
공식 문서에 있는 두 테스트 시크릿 키 형식을 허용하도록 수정 후 실행한
위 POST가 이번 작업의 유일한 외부 API 요청이다. 추가 호출은 하지 않았다.
기존 기능 테스트는 이 진단 작업에서 실행하거나 변경하지 않았다.

## 사용자 요청에 따른 추가 1회 실행

응답의 code만 출력하도록 수정 후 구문 검사를 통과했다.
승인 API를 추가로 한 번만 호출했고 `NOT_FOUND_PAYMENT_SESSION`을 출력했다.
예상했던 `NOT_FOUND_PAYMENT`와 달라 종료 코드는 1이다.
이 실행의 HTTP 상태·다른 응답 필드는 출력하거나 저장하지 않았다.
추가 재시도는 하지 않았다. 두 요청을 합쳐 외부 승인 API 호출은 총 2회다.

공식 근거:

- [승인 API](https://docs.tosspayments.com/reference#결제-승인)
- [API 키 종류](https://docs.tosspayments.com/reference/using-api/api-keys)
- [Basic 인증](https://docs.tosspayments.com/reference/using-api/authorization)
- [API 오류 코드](https://docs.tosspayments.com/reference/error-codes)
