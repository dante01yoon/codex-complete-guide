# Rules Module Contract

공개 진입점은 후속 구현의 `src/rules/index.ts`이다. HTTP·저장소 계약은 없다.
아래는 함수 서명 설계이며 구현 코드가 아니다.
모델 상세는 [data-model.md](../data-model.md)를 따른다.

## Function contracts

| 함수 | 입력 | 출력 | 보장·근거 |
|---|---|---|---|
| intervalsOverlap(a, b) | 정상 TimeRange 두 개 | boolean | 반열린 구간 겹침. 끝 = 시작은 false; AC-04-3 |
| hasReservationOverlap(charger, range, occupancies) | ChargerIdentity, 정상 TimeRange, readonly Occupancy[] | boolean | 같은 식별 조합의 겹침만 true; AC-01-1 식별 부분·AC-04-3 |
| supportsConnector(chargerType, connector) | 알려진 ChargerTypeCode, ConnectorKind | boolean | PRD 1.4 표에 포함된 조합만 true; AC-02-6·AC-02-7 |
| evaluateReservationRules(input) | 정상 ReservationRuleInput | ReservationRuleResult | 두 규칙과 기존 자격 결과를 함께 판정; AC-04-3·AC-02-6·AC-02-8 전달 부분 |

입력은 readonly로 받고 모든 함수는 동기·순수 함수로 설계한다.
I/O·전역 가변 상태·Date.now·시계·로그·랜덤·JSON 파일 읽기를 사용하지 않는다.
입력 계약을 충족하지 않는 외부 원본을 정규화하는 어댑터는 만들지 않는다.

## Combined result table

| overlapFree | connectorSupported | existingEligibilityPassed | rulesPassed |
|---|---|---|---|
| true | true | true | true |
| false | true | true | false |
| true | false | true | false |
| false | false | true | false |
| 어느 값이든 | 어느 값이든 | false | false |

각 조건을 함께 반환해 겹침과 불일치가 동시에 있을 때 한 원인을 숨기지 않는다.
조건들의 표시 순서를 선택하지 않는다. UI는 이번 범위에서 제외되어 있으며 이 표는 UI 정책이 아니다.
`rulesPassed=true`는 해당 스냅샷의 조건 통과이지 원자적 점유 확보·결제 승인·예약 확정이 아니다.
동시 요청 사이의 상태 변경을 보호하는 책임은 향후 예약·저장 처리 계층에 있다.

## Test traceability

| 원문 AC | 명세 시나리오 | 후속 테스트 파일 | 검증 범위 |
|---|---|---|---|
| AC-04-3 | S-01~S-07, S-13~S-15 | tests/rules/overlap.test.ts, reservation.test.ts | 확정·유효 점유, 연속 양방향, 동일·포함 구간·다른 충전기 |
| AC-01-1 | S-07 | tests/rules/overlap.test.ts | 식별 조합 비교만. 목록·누락 정보 화면 제외 |
| AC-02-6 | S-08·S-09·S-13~S-15 | tests/rules/connector.test.ts, reservation.test.ts | 지원·불일치 및 결과로 사유 구분. 화면 안내 제외 |
| AC-02-7 | S-10~S-12 | tests/rules/connector.test.ts | 66개 조합. 기대값은 PRD에서 독립 작성하고 구현 표를 재사용하지 않음 |
| AC-02-8 | S-16 | tests/rules/reservation.test.ts | 기존 제한 false가 통과로 바뀌지 않음. 제한 정책 계산·화면 제외 |

유효 목록이 빈 경우 겹침 false, 같은 입력 반복 결과 동일, 입력 동결 후 변경 없음도 확인한다.
테스트 이름에는 원문 AC 번호와 S 번호를 포함한다.
표의 테스트 경로는 예정이며 현재 테스트 파일·구현 파일은 없다.
