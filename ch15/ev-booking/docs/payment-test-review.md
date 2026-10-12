# 15장 — 승인·웹훅 테스트 확인 자료

## 이번 작업

T-50의 테스트 작성 단계이다. 제품 소스·기존 테스트·훅·스위치는 수정하지 않았다.
테스트 파일은 실제 공개 진입점 `src/rules/index.ts`를 호출할 계약을 담고 있다.
미구현 함수를 테스트용 가짜 성공 함수로 대체하지 않는다.
사용자 테스트 확인 전에는 Vitest를 실행하지 않으며 구현도 시작하지 않는다.

- 승인: [payment-approval.test.ts](../tests/rules/payment-approval.test.ts) — 정적 사례 수 33개.
- 웹훅: [payment-webhook.test.ts](../tests/rules/payment-webhook.test.ts) — 정적 사례 수 17개.
- 공통 입력·출력 계약: [payment-fixtures.ts](../tests/rules/payment-fixtures.ts).

## 입력과 기대 결과

일반 예약의 저장 주문은 `order_demo_001`, 금액은 KRW 정수 3,000원이며,
점유 만료는 서울 시연 시각 `2026-10-11 10:10:00.000`이다.
소유자·충전기 자격·커넥터·진행 중 예약 제한 검사를 통과한 입력을 전제로 한다.

| 관련 AC | 사례 | 기대 결과 |
|---|---|---|
| AC-05-7 | 요청 금액 100·0·-1·3,000.5·6,000·NaN·Infinity, 다른 주문 ID | 승인 전 금액 검증 거절. 정상 주문의 3,000원은 통과 |
| AC-05-2·8·9 | 카드 DONE, 10:09:59.999, 자리 확보 가능 | 예약 1건·결제 반영 3,000원, 확정 효과 1건 |
| AC-05-3·8 | 카드 DONE을 10:10:00.000·10:10:00.001·11:00에 처음 확인 | 예약 0건, 전액 환불 요청 1건. 실제 환불 완료 금액은 아직 0원 |
| AC-05-5 | 기한 내 DONE이지만 자리 확보 실패 | 예약 0건, 3,000원 환불 요청 1건 |
| AC-05-6·9 | READY·IN_PROGRESS·WAITING_FOR_DEPOSIT·CANCELED·PARTIAL_CANCELED·ABORTED·EXPIRED·UNKNOWN | 신규 완료·확정 효과를 만들지 않음 |
| AC-05-7·9 | 조회/승인 응답의 주문·금액·통화 불일치, 카드 외 수단 | 결제 완료·예약 확정으로 수용하지 않음 |
| AC-05-4 | 승인 결과 반복 | 예약 1건·결제 3,000원 유지, 추가 효과 없음 |
| AC-05-9·11 | 웹훅 본문 DONE이나 검증 결과 없음 또는 조회 결과 미완료 | 본문만으로 완료·확정하지 않음 |
| AC-05-4·11 | 승인→웹훅, 웹훅→승인, 같은 웹훅 반복 | 같은 결제 1회 반영. 이미 확정한 결제가 기한 후 재전달되어도 환불하지 않음 |
| AC-05-4·8·11 | 늦은 승인 후 웹훅·승인 응답 반복 | 예약 0건·환불 요청 1건 유지 |

## 구현 시 사용할 내부 계약

- `validatePaymentApprovalRequest(state, request): boolean`: 서버 저장 주문·금액 검증 판정.
- `reduceVerifiedPaymentApproval(state, payment, nowMs): PaymentResult`: 검증된 승인 결과를 상태와 효과 요청으로 변환.
- `reduceVerifiedPaymentWebhook(state, event, verifiedPaymentOrNull, nowMs): PaymentResult`: PAYMENT_STATUS_CHANGED와 검증된 조회 결과에 같은 판정·중복 보호 적용.
- `PaymentResult`는 새 상태와 `confirm-reservation` 또는 `request-refund` 효과 배열이다. 실제 승인·저장·환불 호출이 아니다. 반환 상태의 `processedPaymentKeys`로 채널 간 반복을 식별한다.
- 시간은 호출자가 전달한 서울 시연용 epoch milliseconds이다. 외부 approvedAt·createdAt을 점유 기한 판정에 대신 사용하지 않는다.
- 입력 상태·결제 응답·웹훅 이벤트를 변경하지 않는 순수 함수 계약도 검증한다.

## 이번에 검증하지 않는 부분

- HTTP 승인 요청·웹훅 수신, 인증·소유자 확인, 실제 SDK 객체 전체 파싱, 토스 API 호출·등록.
- 서버 조회가 실제로 실행되는지, 승인 API 호출이 실제로 거절되는지, 영속 저장·동시 처리의 원자성.
- 점유 만료 이벤트의 실제 자리 해제와 사용자 화면. AC-05-3은 승인 시각 경계 부분만 다룬다.
- 실제 결제/환불 완료와 화면 표시. 환불 효과 요청을 환불 성공으로 간주하지 않는다.
- AC-05-10 재시도 횟수: 최초 포함 총 3회인지 추가 3회인지 C-07 답변이 남아 있다.
- T-16~19·T-51 구현 및 T-47 실연결은 완료하지 않았다.

## 확인·실행 상태

- 사용자 테스트 확인: 완료. 사용자가 테스트를 확인하고 커밋했다고 명시했다. 이번 확인 시 커밋은 `2b7ef2a`이다.
- `npm run typecheck`: `PASS` — 새 테스트·내부 계약의 정적 타입 확인만 해당.
- `git diff --check`: `PASS` — 문서/패치 공백 확인만 해당.
- 최초 작성 후 Stop 훅 자동 실행: 새 테스트 50개 `FAIL`, 기존 55개 `PASS`, 타입 검사 `PASS`. 당시 사용자 확인 전 실행이므로 승인 후 실패 확인 관문으로 간주하지 않았다.
- 사용자 확인 후 새 테스트의 실패 확인: `NOT_RUN`. `scripts/loop.sh`의 기준 검사에서 먼저 수행하도록 준비했으며 사용자가 이번 루프 실행은 금지했다.
- 토스 API 실호출·웹훅 실수신·브라우저 검증: `NOT_RUN`.
- 확인 후 실패 실행 명령: `npm run test:rules -- tests/rules/payment-approval.test.ts tests/rules/payment-webhook.test.ts`.
- 시험 대상 규칙 미구현으로 실패하는지 확인한 뒤 결과를 기록한다. 환경 오류나 모듈 로드 오류만으로 RED 관문을 충족했다고 보고하지 않는다.
- 사용자 확인 근거: 헌법 III의 **각 AC 테스트 작성 → 사용자 확인 → 실패 확인 → 구현** 순서. 스위치 ON은 파일 쓰기 허용이며 테스트 내용 승인이나 구현 승인으로 대신하지 않는다.
