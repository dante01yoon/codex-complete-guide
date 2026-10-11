---
description: "순수 예약 규칙의 AC별 테스트 우선 작업 목록"
---

# Tasks: 예약 겹침과 커넥터 호환 규칙

**Input**: `specs/001-reservation-compatibility-rules/`의 설계 문서.
**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md),
[data-model.md](data-model.md), [contracts/rules.md](contracts/rules.md), [quickstart.md](quickstart.md),
[헌법](../../.specify/memory/constitution.md), [프로젝트 작업 목록](../../docs/tasks.md).
**Tests**: 필수. 사용자 요청과 헌법 III에 따라 테스트 작성 → 사용자 확인 → 기능 실패 확인 → 구현 순서.
**Organization**: 명세의 US1·US2·US3별로 테스트·승인·Red·구현·Green을 묶는다.
**Status**: US1/T001~T013 완료. 사용자가 테스트를 확인한 뒤 테스트·설정 커밋 → 미구현 Red 31건 → 구현 Green 31건·타입 검사 → tests/ Git diff 불변 확인. US2·US3은 미착수이며 이번 범위 밖이다.

## Format: `[ID] [P?] [Story] Description`

- 모든 작업은 `- [ ] T번호 [P?] [US번호?] 설명과 파일 경로` 형식이다.
- `[P]`는 선행 완료 후 다른 파일의 작업과 병행 가능한 작업이다. 선행·사용자 확인을 생략하지 않는다.
- `[US1]`은 명세 Story 1(프로젝트 US-04·US-05 부분), `[US2]`는 명세 Story 2(프로젝트 US-02),
  `[US3]`는 명세 Story 3이다. 프로젝트의 `T-04`와 이 문서의 `T004`는 다른 번호다.

## Path Conventions

`src/rules/`·`tests/rules/`는 저장소 루트 기준이다.
검증 기록 경로는 `specs/001-reservation-compatibility-rules/validation.md`이다.
경로는 저장소 루트 기준이며 실제 진행 여부는 체크박스와 validation.md 기록으로 확인한다.
화면·저장소·원본 JSON 로딩·결제·점유 생성/만료·동시 확보는 범위 밖이다.

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: C-10에서 확정한 이 기능의 Node.js 24·TypeScript·Vitest 실행 기반 준비.

- [X] T001 `package.json`과 `package-lock.json`에 Node.js 24, ESM, 호환 TypeScript·Vitest·Node 타입 개발 의존성을 준비하고 버전을 잠금 파일로 고정한다. `test:rules`는 `vitest run tests/rules`, `typecheck`는 `tsc --noEmit`으로 설정한다. 실제 설치 결과를 `specs/001-reservation-compatibility-rules/validation.md`에 기록한다.
- [X] T002 [P] T001 후 `tsconfig.json`에 strict와 noEmit, Node·ESM에 맞는 모듈 해석을 설정하고 예정 `src/rules/**/*.ts`·`tests/rules/**/*.ts`를 타입 검사 범위로 지정한다. 제품 규칙·비정상 입력의 처리 정책은 추가하지 않는다.
- [X] T003 [P] T001 후 `vitest.config.ts`에 Node 테스트 환경과 `tests/rules/**/*.test.ts` 수집 범위를 설정한다. DOM·브라우저·외부 서버를 사용하지 않고 테스트 없는 실행을 기능 PASS로 처리하지 않는다.

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: 공유 타입과 증거 기록 형식 준비. 알고리즘·커넥터 지원 표·예약 판정은 아직 작성하지 않는다.

- [X] T004 T002·T003 후 `src/rules/types.ts`에 data-model.md의 타입만 정의한다. 식별자는 "readonly string, 정상 원본 식별자", startMs는 "readonly number, 유한 정수", endMs는 "readonly number, 유한 정수, startMs < endMs", kind는 "`confirmed` 또는 `valid-hold`", 목록은 "readonly Occupancy[]", 기존 자격 결과는 "boolean"을 따른다. 커넥터 6종과 앞자리 0을 유지한 `01`~`11` 코드 리터럴 및 readonly 중첩 입출력 필드를 선언한다. 입력 유효성 전제는 문서화하고 미정 실패 정책이나 구현 로직을 넣지 않는다.
- [X] T005 T004 후 `specs/001-reservation-compatibility-rules/validation.md`에 작업·AC·S·검증 부분·실행 명령·기대/실제·상태·사용자 확인 근거·승인 파일 SHA-256 기록 형식을 만든다. 현재 실행하지 않은 항목은 NOT_RUN, 진행 불가 항목은 BLOCKED로 기록한다. 계획 승인을 테스트 승인으로 기록하지 않는다.

**Checkpoint**: 공유 타입·도구·기록 형식만 준비되었다. 기능 구현은 각 Story의 승인·Red 관문 이후다.

## Phase 3: User Story 1 - 이미 확보된 충전기 시간 보호 (Priority: P1) — MVP

**Goal**: 같은 충전기의 시간 겹침만 판정하며 기존 종료 = 새 시작을 비겹침으로 허용한다.
**Independent Test**: AC-04-3/S-01~S-07과 AC-01-1/S-07의 식별 비교를
`tests/rules/overlap.test.ts`에서 단독 실행한다.

### Tests for User Story 1 — 구현 전에 작성

- [X] T006 [P] [US1] T005 후 `tests/rules/overlap.test.ts`에 **AC-04-3 / S-01, S-02, S-03, S-04, S-05** 테스트를 먼저 작성한다. 확정·유효 점유 부분 겹침 true, 양방향 종료/시작 동일 경계 false를 검증하며 서울 오프셋 `+09:00`이 명시된 고정 시간을 사용한다.
- [X] T007 [US1] T006 후 같은 `tests/rules/overlap.test.ts`에 **AC-04-3 / S-06, S-07 및 AC-01-1 / S-07** 테스트를 작성한다. 동일·포함 구간은 true, 같은 충전소의 다른 chgerId 및 다른 statId의 동일 chgerId는 false여야 한다. 원문 AC-01-1 전체 화면 검증이 아닌 식별 비교 부분임을 명시한다.
- [X] T008 [US1] T007 후 `tests/rules/overlap.test.ts`에 **AC-04-3 / S-01~S-07 재사용** 순수성 테스트와 빈 유효 목록 false 사례를 작성한다. 중첩 입력 동결·동일 입력 반복·입력 불변을 확인하고 테스트 이름에 AC·S 번호를 남긴다.
- [X] T009 [US1] T008 후 `src/rules/overlap.ts`에 계약의 함수 서명과 명시적 미구현 진입점만 마련하고 `src/rules/index.ts`에서 해당 선언을 내보낸다. 알고리즘은 넣지 않는다. `tests/rules/overlap.test.ts`가 import 오류가 아니라 대상 함수 호출의 미구현 실패를 검증할 수 있게 한다. 테스트 파일은 이 단계에서 바꾸지 않는다.
- [X] T010 [US1] T009 후 `tests/rules/overlap.test.ts`의 **AC-04-3 / S-01~S-07, AC-01-1 / S-07** 입력·기대 결과를 사용자에게 제시하고 명시적 확인을 기다린다. 확인 근거·파일 SHA-256을 `specs/001-reservation-compatibility-rules/validation.md`에 기록한다. 답변 없이 T011 이후로 진행하지 않는다.
- [X] T011 [US1] T010의 사용자 확인 후 `tests/rules/overlap.test.ts`를 `npx --no-install vitest run tests/rules/overlap.test.ts`로 실행해 **AC-04-3 / S-01~S-07, AC-01-1 / S-07** 대상 함수 미구현 실패를 확인하고 `specs/001-reservation-compatibility-rules/validation.md`에 기록한다. 환경·수집·import 오류만 있으면 BLOCKED이며 T012를 시작하지 않는다.

### Implementation for User Story 1

- [X] T012 [US1] T011의 AC별 실패 증거가 있을 때만 `src/rules/overlap.ts`의 intervalsOverlap·hasReservationOverlap을 구현한다. `[startMs, endMs)`, 두 식별 필드 비교, 확정·유효 점유 입력만 사용하고 입력을 변경하지 않는다. `tests/rules/overlap.test.ts`·승인 기대값·실행 제외 설정은 고치지 않는다.
- [X] T013 [US1] T012 후 승인된 `tests/rules/overlap.test.ts`의 **AC-04-3 / S-01~S-07, AC-01-1 / S-07**을 재실행하고 타입 검사·테스트 해시 불변을 확인해 `specs/001-reservation-compatibility-rules/validation.md`에 Green 결과와 부분 AC 범위를 기록한다. 경계 오거절 0건을 확인한다.

**Checkpoint**: US1 단독 모듈 MVP. 실제 예약 생성·화면·동시성 보호를 완료로 보고하지 않는다.

## Phase 4: User Story 2 - 선택 커넥터 지원 판정 (Priority: P1)

**Goal**: 공식 대응표의 알려진 종류·코드 조합만 판정한다.
**Independent Test**: `tests/rules/connector.test.ts`만으로 AC-02-6/S-08·S-09,
AC-02-7/S-10~S-12와 66조합을 검증한다. US1 구현에 의존하지 않는다.

### Tests for User Story 2 — 구현 전에 작성

- [ ] T014 [P] [US2] T005 후 `tests/rules/connector.test.ts`에 **AC-02-6 / S-08, S-09, AC-02-7 / S-10, S-11** 테스트를 먼저 작성한다. `04`/DC콤보 true, `01`/DC콤보 false, 복합 `06`과 `10`의 지원·불지원 종류를 명세대로 확인한다.
- [ ] T015 [US2] T014 후 `tests/rules/connector.test.ts`에 **AC-02-7 / S-12**의 6종×11코드 66조합 테스트와 동일 입력 반복 검사를 작성한다. 기대값은 PRD 1.4에서 독립 작성하고 구현의 지원 표를 가져오지 않는다. DC콤보와 DC콤보2(버스전용)를 합치지 않으며 미선택·미정의 코드는 테스트 기대 정책으로 추가하지 않는다.
- [ ] T016 [US2] T015 후 `src/rules/connector.ts`에 supportsConnector의 계약 서명과 미구현 진입점만 마련하고 `src/rules/index.ts`에 공개 내보내기를 추가한다. 지원 표나 판정 로직은 쓰지 않고 `tests/rules/connector.test.ts`는 수정하지 않는다.
- [ ] T017 [US2] T016 후 `tests/rules/connector.test.ts`의 **AC-02-6 / S-08, S-09, AC-02-7 / S-10, S-11, S-12**를 사용자에게 제시해 확인받고 `specs/001-reservation-compatibility-rules/validation.md`에 승인 근거·파일 SHA-256을 기록한다. 사용자 답변 없이 T018로 진행하지 않는다.
- [ ] T018 [US2] T017의 사용자 확인 후 `tests/rules/connector.test.ts`를 `npx --no-install vitest run tests/rules/connector.test.ts`로 실행해 **AC-02-6 / S-08, S-09, AC-02-7 / S-10, S-11, S-12**의 실제 미구현 실패를 확인하고 `specs/001-reservation-compatibility-rules/validation.md`에 기록한다. 도구 오류는 Red가 아니다.

### Implementation for User Story 2

- [ ] T019 [US2] T018의 AC별 실패 증거 후에만 `src/rules/connector.ts`의 PRD 1.4 지원 표와 supportsConnector를 구현한다. 알려진 6종·`01`~`11` 코드만 받고 입력 불변·외부 의존성 없음을 유지한다. 승인된 `tests/rules/connector.test.ts`를 변경하지 않는다.
- [ ] T020 [US2] T019 후 승인된 `tests/rules/connector.test.ts`의 **AC-02-6 / S-08, S-09, AC-02-7 / S-10, S-11, S-12**를 재실행하고 66조합 일치·타입 검사·해시 불변을 확인해 `specs/001-reservation-compatibility-rules/validation.md`에 기록한다. UI 거절 안내와 버스 차량 자격은 검증하지 않았다고 명시한다.

**Checkpoint**: US2 단독 판정 완료. 차량 자동 판별·어댑터·원본 로딩은 제외된다.

## Phase 5: User Story 3 - 두 규칙과 기존 제한 결합 (Priority: P1)

**Goal**: 어느 조건도 우회하지 않는 결합 판정. 규칙 통과는 예약 확정이 아니다.
**Independent Test**: 정상 입력 스냅샷의 결합 결과를
`tests/rules/reservation.test.ts`에서 검증한다. 앞 단계 함수의 실제 구현은 결합 구현의 선행이다.

### Tests for User Story 3 — 구현 전에 작성

- [ ] T021 [P] [US3] T005 후 `tests/rules/reservation.test.ts`에 **AC-04-3·AC-02-6 / S-13, S-14, S-15** 테스트를 먼저 작성한다. 겹침·일치, 연속·불일치, 겹침·불일치 결과의 각 조건과 rulesPassed=false를 검증한다. 입력 동결·반복 결과도 같은 시나리오로 확인한다.
- [ ] T022 [US3] T021 후 `tests/rules/reservation.test.ts`에 **AC-02-8 / S-16** 테스트를 작성한다. 입력 existingEligibilityPassed=false가 결과에 유지되고 두 규칙을 만족해도 rulesPassed=false임을 확인한다. 계약의 세 조건 모두 true인 경우도 대조 검증한다. 원본 제한 정책 자체는 구현하거나 검증하지 않는다.
- [ ] T023 [US3] T022 후 `src/rules/reservation.ts`에 evaluateReservationRules의 서명·미구현 진입점만 마련하고 `src/rules/index.ts`에 내보내기를 추가한다. 두 규칙 호출·결합 알고리즘은 쓰지 않고 `tests/rules/reservation.test.ts`를 변경하지 않는다.
- [ ] T024 [US3] T023 후 `tests/rules/reservation.test.ts`의 **AC-04-3·AC-02-6 / S-13, S-14, S-15, AC-02-8 / S-16**을 사용자에게 제시해 확인받고 `specs/001-reservation-compatibility-rules/validation.md`에 승인 근거·파일 SHA-256을 기록한다. 사용자 답변 없이 T025로 진행하지 않는다.
- [ ] T025 [US3] T024의 사용자 확인 후 `tests/rules/reservation.test.ts`를 `npx --no-install vitest run tests/rules/reservation.test.ts`로 실행해 **AC-04-3·AC-02-6 / S-13, S-14, S-15, AC-02-8 / S-16**의 미구현 실패를 확인하고 `specs/001-reservation-compatibility-rules/validation.md`에 기록한다. 기존 US1·US2를 통과했다고 결합의 Red를 생략하지 않는다.

### Implementation for User Story 3

- [ ] T026 [US3] T013·T020·T025 완료 후에만 `src/rules/reservation.ts`에서 실제 겹침·지원 함수를 사용해 결합 결과를 구현한다. overlapFree·connectorSupported·existingEligibilityPassed·rulesPassed를 반환하고 기존 자격 결과를 그대로 유지한다. 표시 우선순위·저장·예약 생성·현재 시각 조회를 넣지 않고 `tests/rules/reservation.test.ts`를 변경하지 않는다.
- [ ] T027 [US3] T026 후 승인된 `tests/rules/reservation.test.ts`의 **AC-04-3·AC-02-6 / S-13, S-14, S-15, AC-02-8 / S-16**을 재실행하고 타입 검사·테스트 해시 불변을 확인해 `specs/001-reservation-compatibility-rules/validation.md`에 기록한다. AC-02-8의 검증은 기존 제한 전달 부분임을 명시한다.

**Checkpoint**: US3 결합 판정 완료. 전체 AC·예약·화면 성공으로 확대하지 않는다.

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: 승인된 테스트를 유지한 채 전체 범위·실행 근거 검토.

- [ ] T028 T013·T020·T027 후 `tests/rules/overlap.test.ts`, `tests/rules/connector.test.ts`, `tests/rules/reservation.test.ts`의 **AC-01-1 / S-07, AC-04-3 / S-01~S-07·S-13~S-15, AC-02-6 / S-08·S-09·S-13~S-15, AC-02-7 / S-10~S-12, AC-02-8 / S-16**을 `npm run test:rules`로 전부 실행한다. `npm run typecheck`와 승인 해시 비교를 수행해 `specs/001-reservation-compatibility-rules/validation.md`에 분리 기록한다. 새 테스트가 필요하면 구현을 멈추고 테스트 작성·사용자 확인·Red 단계로 돌아간다.
- [ ] T029 T028 후 `src/rules/types.ts`, `src/rules/overlap.ts`, `src/rules/connector.ts`, `src/rules/reservation.ts`, `src/rules/index.ts`의 계약·readonly·순수성·I/O 부재를 정적 검토하고 `specs/001-reservation-compatibility-rules/validation.md`에 코드 검토 결과를 실행 테스트와 구분해 기록한다. 테스트 변경이나 미정 정책 추가는 금지한다.
- [ ] T030 T029 후 `specs/001-reservation-compatibility-rules/quickstart.md`와 `specs/001-reservation-compatibility-rules/validation.md`에 실제 명령·버전·AC별 PASS/FAIL/BLOCKED/NOT_RUN·부분 검증 범위·남은 제한을 기록하고 이 `specs/001-reservation-compatibility-rules/tasks.md`에서 실제 완료된 작업만 체크한다. docs/tasks.md의 전체 T-04·T-13·T-17을 완료로 확대하지 않는다.

## Dependencies & Execution Order

### Phase Dependencies

Setup: T001 → T002/T003 → T004 → T005. 이후 각 Story의 테스트 작성이 가능하다.
번호 순서는 기본 실행 순서이며 다른 Story의 독립 작업은 아래 선행을 갖추면 병행할 수 있다.
각 Story의 테스트 파일 작성·사용자 확인·Red는 그 Story 구현보다 반드시 앞선다.

```text
T001 → (T002 || T003) → T004 → T005
  ├→ T006 → T007 → T008 → T009 → T010 승인 → T011 Red → T012 → T013 Green
  ├→ T014 → T015 → T016 → T017 승인 → T018 Red → T019 → T020 Green
  └→ T021 → T022 → T023 → T024 승인 → T025 Red
(T013 + T020 + T025) → T026 → T027 Green
(T013 + T020 + T027) → T028 → T029 → T030
```

### User Story Dependencies

- US1: 공유 기반 후 단독 완결. US2·US3 구현에 의존하지 않는다.
- US2: 공유 기반 후 단독 완결. US1 구현에 의존하지 않는다.
- US3: 테스트·승인·Red 준비는 공유 기반 후 가능하고 실제 결합 구현은 US1·US2 Green에 의존한다.
- 같은 `src/rules/index.ts`를 쓰는 T009·T016·T023은 순차 처리한다.
  공유 validation.md 기록도 한 번에 한 작업만 갱신한다.

### Within Each User Story

테스트 작성 → 로직 없는 호출 기반 준비 → 사용자 테스트 확인 → Red 증거 → 구현 → Green.
승인 파일·기대값·실행 제외 설정을 구현 중 바꾸지 않는다.
테스트 오류가 드러나면 해당 구현을 중단하고 별도 테스트 단계로 돌아가 다시 확인·Red를 거친다.

### Parallel Opportunities

T002/T003은 T001 후 서로 다른 설정 파일이다.
T006/T014/T021은 T005 후 서로 다른 테스트 파일이므로 병행 가능하다.
각 테스트 파일의 후속 추가 작업은 앞 작업 완료 후 순차 진행한다.
US1·US2의 알고리즘 구현은 각자의 승인·Red 후 다른 파일에서 병행할 수 있으나
해당 태스크는 기본 순차 순서이며 공유 진입점·검증 기록을 동시에 수정하지 않는다.

## Parallel Example: User Story 1

US1의 T006은 US2의 T014 또는 US3의 T021과 병행 가능하다.
US1 내부 T006·T007·T008은 동일 `tests/rules/overlap.test.ts`를 수정하므로 병행하지 않는다.

## Parallel Example: User Story 2

US2의 T014는 US1의 T006과 병행 가능하다.
US2 내부 T014·T015는 동일 `tests/rules/connector.test.ts`를 수정하므로 순차 처리한다.

## Parallel Example: User Story 3

US3의 T021은 US1·US2의 최초 테스트 작성과 병행 가능하다.
T026은 T013·T020·T025 완료 전에는 실행할 수 없다.
이 예시는 작업 목록의 가능성을 설명하며 현재 병렬 실행이나 에이전트 실행을 요청하지 않는다.

## Implementation Strategy

### MVP First (User Story 1 Only)

T001~T005 → T006~T013을 수행하고 겹침·같은 경계·다른 충전기 판정을 단독 확인한다.
MVP는 로컬 모듈이며 배포하거나 모바일 예약 서비스를 완성했다고 보고하지 않는다.

### Incremental Delivery

US1 Green → US2의 독립 커넥터 판정 Green → US3 결합 Green → 전체 승인 테스트·타입 검사·기록 검토.
각 단계의 사용자 확인은 준비된 실제 테스트 파일을 대상으로 받고 전체 계획 승인으로 대신하지 않는다.

### Parallel Team Strategy

인원이 있다면 공유 기반 후 서로 다른 Story 테스트 파일 작성을 병행할 수 있다.
사용자 승인과 Red 없이 기능 구현을 병렬로 먼저 시작하지 않는다.

## Notes

- 작업 수: 30개. Setup 3, Foundational 2, US1 8, US2 7, US3 7, 최종 검토 3.
- 테스트 작성 작업: T006·T007·T008·T014·T015·T021·T022.
  사용자 확인 작업: T010·T017·T024. Red 작업: T011·T018·T025.
  기능 구현 작업: T012·T019·T026. 모든 해당 테스트·확인·Red가 구현의 선행이다.
- 테스트 실행·Green·최종 회귀 작업에도 AC와 S를 명시했다.
- 체크박스는 실제 완료 증거가 있을 때만 갱신한다. T001~T013은 US1 부분 검증 근거로 완료했고 다른 Story와 전체 앱의 통과를 뜻하지 않는다.
- 확장 훅 설정 파일이 없어 before_tasks·after_tasks를 실행하지 않았다.
- 명세 품질 확인과 기능 테스트 실행 결과는 서로 다른 증거다.
