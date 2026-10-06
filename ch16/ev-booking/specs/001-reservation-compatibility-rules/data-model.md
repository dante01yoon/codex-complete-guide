# Data Model: 예약 겹침과 커넥터 호환 규칙

이 문서는 메모리 내 입출력 모델이며 저장 스키마가 아니다.
근거: [spec.md](spec.md), [PRD](../../docs/prd.md), [AC](../../docs/acceptance.md).

## ChargerIdentity

| 필드 | 타입·전제 | 의미 |
|---|---|---|
| statId | readonly string, 정상 원본 식별자 | 충전소 ID |
| chgerId | readonly string, 정상 원본 식별자 | 충전기 ID |

두 필드를 각각 비교한다. 문자열 연결로 키를 만들거나 충전소 ID만으로 비교하지 않는다.
AC-01-1·AC-04-3의 식별 부분만 다룬다.

## TimeRange

| 필드 | 타입·전제 | 의미 |
|---|---|---|
| startMs | readonly number, 유한 정수 | 시작 시각 epoch milliseconds |
| endMs | readonly number, 유한 정수, startMs < endMs | 종료 시각 epoch milliseconds |

`[startMs, endMs)`를 사용한다. 두 구간의 겹침은
`a.startMs < b.endMs && b.startMs < a.endMs`이다.
서울 시각 예시는 `2026-10-06T10:00:00+09:00`처럼 오프셋을 명시해 테스트에서 변환한다.
현재 시각 조회·문자열 시간 파싱·기간·길이 검증은 모듈에서 수행하지 않는다.
비정상·역전·0길이 입력은 계약 전제 밖이며 제품 실패 정책을 임의로 추가하지 않는다.

## Occupancy

| 필드 | 타입·전제 | 의미 |
|---|---|---|
| charger | readonly ChargerIdentity | 확보된 충전기 |
| range | readonly TimeRange | 충전기 이용 구간 |
| kind | `confirmed` 또는 `valid-hold` | 확정 예약 또는 유효 임시 점유 |

호출자가 현재 판정 시점에 유효한 목록만 제공한다.
만료·취소 기록은 제외해 전달하며 이 모듈이 취소나 유효 기한을 계산하지 않는다.
점유 만료 시각과 충전기 이용 종료 시각을 혼동하지 않는다.
상태 전이와 점유 생성은 이번 모델에 없다.

## ConnectorKind / ChargerTypeCode

선택 종류는 `DC차데모`, `AC완속`, `AC3상`, `DC콤보`, `NACS`, `DC콤보2(버스전용)`의
6개 문자열 리터럴 타입으로 설계한다. 타입 코드는 앞자리 0을 유지한 `01`~`11` 문자열이다.
[PRD 1.4](../../docs/prd.md#14-커넥터와-충전기-타입-대응-근거)의 대응표를 그대로 따른다.
선택값 누락·알 수 없는 코드·어댑터·버스 자격 판정은 C-11의 별도 범위이다.

## ReservationRuleInput

| 필드 | 타입·전제 | 의미 |
|---|---|---|
| charger | readonly ChargerIdentity | 요청 충전기 |
| range | readonly TimeRange | 요청 이용 구간 |
| connector | ConnectorKind | 선택 완료된 커넥터 |
| chargerType | ChargerTypeCode | 알려진 원본 타입 코드 |
| occupancies | readonly Occupancy[] | 사전 판정된 유효 시간 확보 목록 |
| existingEligibilityPassed | boolean | 호출자의 기존 자격·권한·시간 제한 판정 결과 |

`existingEligibilityPassed`는 기존 정책을 계산하는 새 규칙이 아니라 결과 전달 계약이다.
참이라고 입력받아도 이 모듈은 예약을 생성하거나 확정하지 않는다.
거짓일 때 결합 결과가 통과할 수 없으므로 기존 제한을 우회하지 않는다.

## ReservationRuleResult

| 필드 | 타입 | 의미 |
|---|---|---|
| overlapFree | boolean | 같은 충전기의 유효 확보 구간과 겹치지 않음 |
| connectorSupported | boolean | 대응표에 선택 종류가 포함됨 |
| existingEligibilityPassed | boolean | 입력 기존 제한 결과를 그대로 유지 |
| rulesPassed | boolean | 위 세 조건이 모두 참 |

결과는 검증 단계의 판정이다. UI 문구·표시 순서·결제 승인·예약 확정이 아니다.
입력과 중첩 객체·배열을 변경하지 않고 새 결과 객체를 반환한다.
같은 스냅샷은 같은 결과를 반환하며 외부 상태·현재 시각을 참조하지 않는다.
