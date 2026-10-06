# Implementation Plan: 예약 겹침과 커넥터 호환 규칙

**Branch**: `main` | **Date**: 2026-10-05 | **Spec**: [spec.md](spec.md)

**Input**: `specs/001-reservation-compatibility-rules/spec.md`와 사용자 범위 지정.
setup-plan의 BRANCH 값 `001-reservation-compatibility-rules`는 기능 디렉터리 식별자이며
실제 Git 브랜치는 `main`이다. 브랜치를 생성하거나 전환하지 않았다.

## Summary

Node.js 24·TypeScript·Vitest로 `src/rules`의 순수 함수 모듈을 계획한다.
같은 충전기의 확정 예약·유효 임시 점유와 겹치는 구간을 거절하고,
선택 커넥터와 알려진 충전기 타입의 호환을 PRD 대응표로 판정한다.
시작 포함·종료 제외 구간이므로 기존 종료 = 새 시작은 겹침이 아니다.

모듈은 입력 스냅샷만 평가한다. 화면·저장소·로그인·결제·점유 생성·만료·동시 확보는 제외한다.
기존 자격 판정은 호출자가 전달하며 이 모듈의 통과를 전체 예약 확정으로 사용하지 않는다.
이번 단계에서는 아래 설계 문서만 작성하고 코드·테스트·설정 파일은 생성하지 않는다.

## Technical Context

**Language/Version**: Node.js 24, TypeScript. 로컬 관찰값 Node.js v24.14.1.
**Primary Dependencies**: 실행 규칙 모듈의 외부 의존성 없음. 개발 도구 TypeScript·Vitest·Node 타입 정의.
도구의 정확한 버전은 후속 테스트 환경 준비에서 호환성을 확인하고 잠금 파일로 고정한다.
**Storage**: 이번 범위에서 제외. 배열·객체 입력만 사용하며 원본 JSON 직접 읽기도 제외.
**Testing**: Vitest의 Node 환경, AC별 테스트와 TypeScript 별도 타입 검사.
**Target Platform**: 로컬 Node.js 24. 시간값은 서울 오프셋을 명시해 정규화한 epoch milliseconds.
**Project Type**: 앱 내부에서 사용할 규칙 라이브러리 모듈. HTTP API·화면 없음.
**Performance Goals**: 임의 성능 SLA를 추가하지 않는다. 점유 n건 선형 탐색 O(n), 커넥터 대응 조회 O(1).
**Constraints**: 입력 불변·동일 입력 동일 출력·I/O 및 현재 시각 조회 없음.
알려진 커넥터·타입, 정상 시간 구간, 사전 판정된 유효 점유만 입력받는다.
**Scale/Scope**: 시나리오 S-01~S-16, 커넥터 6종 × 코드 11종 66조합.
AC-01-1 식별 부분, AC-04-3, AC-02-6·AC-02-7, AC-02-8 기존 제한 전달 부분만 검증한다.

## Constitution Check

*GATE: Phase 0 전과 Phase 1 후에 같은 기준으로 검토한다.*

| 헌법 관문 | 설계 전 | 설계 후 | 근거·한계 |
|---|---|---|---|
| 문서 정책·AC 추적 | PASS | PASS | spec.md와 계약·검증표에 AC 연결. 미정 C를 확정하지 않음 |
| 로컬 시연·원본·비밀 보호 | PASS | PASS | 데이터 원본 읽기·수정, 네트워크, 결제, 배포 제외 |
| 테스트 우선 계획 | PASS | PASS | AC별 테스트 작성 → 사용자 확인 → 실제 실패 → 구현. 구현 중 테스트 불변 |
| 시간·상태·권한 일관성 | PASS | PASS | 반열린 구간, 명시적 입력 시각, 사전 판정된 유효 점유·기존 자격 입력 |
| 증거·완료 범위 정직성 | PASS | PASS | 정적 문서 검토만 수행. 기능 실행·사용자 테스트 승인·실패 확인은 NOT_RUN |

위 PASS는 **계획의 헌법 준수 검토**이며 구현 착수 관문 통과가 아니다.
테스트 파일과 사용자 확인, 기능 실패 증거가 아직 없으므로 구현은 시작하지 않는다.
기존 T-04·T-13·T-17의 전체 선행 T와 C는 완료로 표시하지 않는다.
사용자가 지정한 순수 판정 부분만 독립 계획하며 전체 앱 연결은 별도 작업이다.

## Project Structure

### Documentation (this feature)

```text
specs/001-reservation-compatibility-rules/
├── spec.md
├── checklists/requirements.md
├── plan.md
├── research.md
├── data-model.md
├── contracts/rules.md
└── quickstart.md
```

Phase 2의 기능 tasks.md는 `$speckit-tasks`에서 작성하며 이번 단계에서는 생성하지 않는다.

### Source Code (repository root)

아래는 후속 단계의 예정 경로이며 아직 생성하지 않았다.

```text
src/rules/
├── types.ts
├── overlap.ts
├── connector.ts
├── reservation.ts
└── index.ts
tests/rules/
├── overlap.test.ts
├── connector.test.ts
└── reservation.test.ts
package.json
package-lock.json
tsconfig.json
vitest.config.ts
```

**Structure Decision**: 규칙별 작은 파일과 하나의 공개 진입점으로 분리한다.
화면·저장소 어댑터를 만들지 않는다. 시계·유효 점유·기존 자격 결과는 호출자 입력이다.
환경 설정은 후속 테스트 작성 단계의 실행 기반이며 이번 계획에서 설치하지 않는다.

## Complexity Tracking

헌법 위반과 예외는 없다. DB, 서버, UI, ORM, 외부 API 또는 별도 프레임워크를 도입하지 않는다.

## Phase 0 — Research

[research.md](research.md)에 시간 표현, 순수 함수 경계, 커넥터 대응,
테스트 도구와 테스트 우선 실행 절차의 결정·근거·대안을 기록한다.
범위 안의 설계 미정 사항은 없고, 제품 미정 사항은 계약 입력의 전제 밖에 둔다.

## Phase 1 — Design and Validation

- [data-model.md](data-model.md): 입력·출력·불변성·정상 입력 전제.
- [contracts/rules.md](contracts/rules.md): 모듈 소비자가 사용하는 함수 계약과 AC 대응.
- [quickstart.md](quickstart.md): 후속 환경 준비와 사용자 확인·Red·Green·타입 검사 절차.
- 결합 함수는 겹침, 커넥터 지원, 기존 자격 결과를 각각 반환한다.
  둘 이상의 실패가 있어도 사유의 UI 표시 우선순위를 정하지 않는다.
- AC-02-8은 전달된 기존 제한이 유지되는지 검증한다.
  원본 자격 계산·권한·화면 사유 안내까지 AC 전체 PASS로 확대하지 않는다.

문서 링크·AC 대응·범위·헌법 관문을 검토하고 Phase 1에서 종료한다.
