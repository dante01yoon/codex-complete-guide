# Validation: 예약 겹침과 커넥터 호환 규칙

작성일: 2026-10-05. 사용자 범위: US1/T001~T013, 테스트 작성 후 확인 전 정지.

## 기록 형식

각 검증은 작업 ID, 원문 AC, S 번호, 검증 부분, 실행 명령, 기대/실제 결과,
PASS/FAIL/BLOCKED/NOT_RUN, 사용자 확인 근거, 승인 파일 SHA-256을 기록한다.
코드·문서 정적 검토, 타입 검사, 기능 테스트 실행은 별도 증거로 기록한다.

## 환경 준비

- Node.js v24.14.1, npm 11.11.0.
- 설치 명령: `npm install --save-dev --save-exact typescript@7.0.2 vitest@5.0.3 @types/node@24.19.1`.
- 설치 결과: exit 0, 39 packages added. package.json과 package-lock.json으로 버전 고정.
- TypeScript strict/noEmit/NodeNext, Vitest Node 환경·명시적 수집 범위·passWithNoTests=false.
- .gitignore에 의존성·생성물·로그·환경 파일 패턴을 추가했다. 배포·패키지 발행은 하지 않는다.
- 제품 로직은 없다. 타입 정의 외 src/rules 함수 파일·진입점은 사용자 확인 후 T009에서 준비한다.

## 테스트 작성 직후의 기록 (이전 정지 시점)

| 작업 | AC | 시나리오 | 검증 부분 | 명령 | 기대 | 실제 | 상태 |
|---|---|---|---|---|---|---|---|
| T006~T008 | AC-04-3 | S-01~S-07 | 겹침·같은 경계·입력 불변 | 사용자 확인 후 Vitest | 명세와 일치 | 실행 전 | NOT_RUN |
| T007 | AC-01-1 | S-07 | 식별자 두 필드 비교만 | 사용자 확인 후 Vitest | 다른 충전기 겹침 제외 | 실행 전 | NOT_RUN |
| T010 | 위 AC | 위 S | 작성된 실제 테스트 확인 | 사용자 답변 | 명시적 확인 | 답변 대기 | NOT_RUN |
| T011 | 위 AC | 위 S | 미구현 함수 호출 실패 Red | 확인 후 단독 테스트 | 기능 미구현 실패 | 실행 전 | NOT_RUN |
| T012~T013 | 위 AC | 위 S | 겹침 구현·Green·해시 불변 | Red 이후 | 승인 테스트 통과 | 미착수 | NOT_RUN |

사용자 확인 근거: 아직 없음. 계획·목록 승인이나 이번 구현 요청을 테스트 승인으로 대신하지 않는다.
T009 이후 미착수. 함수 모듈이 없어 현재의 테스트 import 미해결은 예상 준비 상태이며 Red 증거가 아니다.

## 테스트 작성 직후의 정적 확인 결과 (이전 정지 시점)

- T001~T005: 환경·설정·타입·기록 형식 준비 완료.
- T006~T008: 테스트 작성 완료. 예상 실행 사례 31개 (구간 7, 두 점유 종류별 11씩, 대조·구간 순수성 2).
- AC-04-3/S-01~S-07, AC-01-1/S-07을 추적하며 추가 대칭·빈 목록·불변성 사례는 파생 검증임을 이름에 명시했다.
- npm ls --depth=0, tsc --version, vitest --version: 도구 확인만 수행. 테스트 수집·실행이 아니다.
- 구문 확인용 구버전 TypeScript JS API 호출은 TypeScript 7에서 API가 없어 FAIL (검사 도구 호출 실패). 기능 Red가 아니다.
- 대체 구문 확인 `./node_modules/.bin/tsc --noEmit --noCheck`: exit 0, PASS (구문·설정 확인만). 전체 의미적 타입 검사와 import 해석은 NOT_RUN.
- 테스트 파일 검토용 SHA-256: `11eebe92cb7b094cf4b4af7b072dcb42004fd5e0e2b8c0750437adf39425c118`. 아직 사용자 승인 해시가 아니며 확인 후 승인 근거와 함께 기록한다.
- T009 함수 선언·T010 사용자 확인·T011 Red·T012 구현·T013 Green: NOT_RUN.
- 함수 진입점이 아직 없으므로 테스트 import 미해결을 임시 선언으로 감추지 않았다. 사용자 확인 후 T009부터 이어간다.
- before_implement·after_implement: 확장 설정 파일이 없어 실행할 훅 없음.
- requirements.md 체크리스트는 읽기 전용으로 검토했으며 변경하지 않았다.

## US1 완료 기록 — 사용자 테스트 승인 후

- 사용자 확인 원문: “테스트 확인했어. 기대 결과가 명세와 맞아.”
- 승인 테스트: `tests/rules/overlap.test.ts`.
- 승인 SHA-256: `11eebe92cb7b094cf4b4af7b072dcb42004fd5e0e2b8c0750437adf39425c118`.
- 테스트·설정 선행 커밋: `cf9322d9e11cf285b029eab83fb83273db871448`.
- 사용자 확인은 이 커밋의 테스트 파일을 대상으로 하며 구현 과정에서 수정하지 않았다.

| 작업 | AC·시나리오 | 명령·증거 | 실제 결과 | 상태 |
|---|---|---|---|---|
| T009 | 계약의 US1 함수 진입점 | evidence/red-stub.txt | 타입이 맞는 진입점만 마련하고 명시적 미구현 Error | PASS (준비) |
| T010 | AC-04-3/S-01~S-07, AC-01-1/S-07 | 위 사용자 원문·승인 해시 | 사용자 확인 수신 | PASS (확인) |
| T011 | 위 AC·S와 파생 입력 불변성 사례 | npx --no-install vitest run tests/rules/overlap.test.ts; evidence/us1-red.txt | exit 1, 31 failed | FAIL (정상 Red 증거) |
| T012 | AC-04-3/S-01~S-07, AC-01-1/S-07 | src/rules/overlap.ts | 반열린 구간·두 식별자·순수 목록 탐색 구현 | PASS (범위 검토) |
| T013 | 위 AC·S와 파생 사례 | npm run test:rules; evidence/us1-green.txt | exit 0, 31 passed | PASS |
| T013 | TypeScript 의미적 검사 | npm run typecheck | exit 0, 오류 없음 | PASS |
| T013 | 승인 이후 tests/ 불변 | git diff --exit-code cf9322d -- tests/ | 출력 없음, exit 0 | PASS |
| T013 | 설정 불변 | git diff --exit-code cf9322d -- package.json package-lock.json tsconfig.json vitest.config.ts | 출력 없음, exit 0 | PASS |
| T013 | tests/ 추가 파일·해시 | git ls-files --others --exclude-standard tests/; SHA-256 비교 | 추가 파일 없음, 승인 해시 동일 | PASS |

### Red 실패 이유

31개 테스트가 수집되어 대상 함수를 호출했으며 import·수집·환경 실패가 아니다.
미구현 intervalsOverlap 호출은 `intervalsOverlap is not implemented (T009)`,
hasReservationOverlap 호출은 `hasReservationOverlap is not implemented (T009)`로 실패했다.
구현 전에 이 실패 요약을 사용자에게 표시했다. 전체 출력과 당시 미구현 진입점을 evidence/에 보존했다.

### Green 범위와 한계

확정 예약·유효 임시 점유의 겹침, 양방향 동일 경계 비겹침, 동일·포함 구간,
다른 충전기 구분, 빈 목록, 입력 동결·반복 결과 사례 31개를 실제 검증했다.
AC-01-1은 식별 비교 부분만, AC-04-3은 순수 겹침 판정 부분만 PASS이다.
예약 생성·원자적 확보·결제·화면 안내·권한 검사·커넥터 Story는 구현하지 않았다.
US2·US3, 브라우저, 토스 테스트 실연결은 NOT_RUN이다.
프로젝트 docs/tasks.md의 전체 T-04·T-13·T-17을 완료로 표시하지 않았다.

before_implement·after_implement: .specify/extensions.yml이 없어 실행할 훅 없음.
