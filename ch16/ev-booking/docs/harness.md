# ev-booking 하네스 구성

하네스는 에이전트가 따르는 문서, 작업 절차, 실행 도구, 검증·차단 장치의 구성이다.
아래는 현재 저장소의 파일과 기존 검증 기록을 확인한 결과이다. 계획에만 있는 기능은 구현 완료로 간주하지 않는다.

## 구성 목록

| 구성 | 파일·위치 | 역할·실행 방법 | 현재 범위·한계 |
|---|---|---|---|
| 작업 지침 | [AGENTS.md](../AGENTS.md) | 필수 문서 읽기, 정책 확인, 순수 함수 경계, 데이터·키 보호, 중단·보고 기준 | 훅 차단 시 즉시 사용자에게 질문. 정책상 테스트 변경은 제안만 정리. 같은 테스트 세 번 연속 실패 시 중단 |
| 제품 정책·수용 기준·작업 목록 | [prd.md](prd.md), [acceptance.md](acceptance.md), [tasks.md](tasks.md) | US·AC·T·C 번호로 정책·검증 범위·선행 조건 추적 | 조건부 AC와 미확정 C는 사용자 답변 필요. C-10은 Node.js 24·TypeScript·Vitest·`src/rules`만 부분 확정 |
| 개발 헌법 | [.specify/memory/constitution.md](../.specify/memory/constitution.md) | AC별 테스트 작성 → 사용자 확인 → 실제 실패 확인 → 구현. 구현 중 테스트 불변, 결과 상태 구분 | 버전 1.0.0. 테스트 오류·정책 변경 시 구현 중단 후 별도 테스트 단계로 진행 |
| Spec Kit 구성 | `.specify/integration.json`, `.specify/init-options.json`, `.specify/scripts/bash/`, `.specify/templates/`, `.specify/workflows/` | Codex skills 방식의 Spec Kit 1.1.0 구성, 명세·계획·작업 생성과 선행 확인 스크립트·템플릿 | `.specify/extensions.yml`은 없음. 기능 검증 기록에서도 `before_implement`·`after_implement` 확장 훅은 실행할 설정이 없다고 기록 |
| 프로젝트 스킬 | `.agents/skills/speckit-*/SKILL.md` | specify, clarify, plan, tasks, implement, analyze, checklist, constitution, converge, taskstoissues의 10개 작업 절차 | 스킬 파일이 있는 것과 각 절차를 실행·완료한 것은 구분 |
| 기능별 명세·증거 | `specs/001-reservation-compatibility-rules/` | spec·plan·research·data-model·contracts·tasks·quickstart·validation·checklists·evidence로 설계와 Red/Green 추적 | [validation.md](../specs/001-reservation-compatibility-rules/validation.md)에 겹침 판정 US1의 승인 해시·31개 Red/Green 기록. 커넥터 US2·US3 완료 증거는 없음 |
| 실행·의존성 | [package.json](../package.json), `package-lock.json` | Node.js `24.x`; TypeScript `7.0.2`, Vitest `5.0.3`, `@types/node` `24.19.1` 버전 고정 | 개발 명령은 `test:rules`, `typecheck`. 화면·서버 실행·배포 명령 없음 |
| 도메인 규칙 | `src/rules/{index,types,overlap,refund,checkin}.ts` | 공개 진입점에서 겹침, 사용자 취소·환불 요청, 일반 체크인 시각 판정 순수 함수 제공 | 시간·상태를 입력받고 결과·효과 요청 반환. 실제 환불·승계·소유자 검사·저장·화면은 별도 영역 |
| 규칙 테스트 | `tests/rules/{overlap,refund,checkin}.test.ts` | `npm run test:rules` | 겹침 31개, 사용자 취소·환불 12개, 일반 체크인 시각 12개, 총 55개. 부분 규칙 검증이며 전체 AC·서비스 통과가 아님 |
| 테스트 수집 설정 | [vitest.config.ts](../vitest.config.ts) | Node 환경에서 `tests/rules/**/*.test.ts` 수집. `passWithNoTests: false` | 테스트가 없는 실행을 성공으로 처리하지 않음 |
| 타입 검사 | [tsconfig.json](../tsconfig.json) | `npm run typecheck` → `tsc --noEmit`; strict·NodeNext·ES2023 | 검사 범위는 `src/rules`, `tests/rules`, Vitest 설정. 타입 통과는 기능 실행 통과와 별개 |
| 훅 이벤트 연결 설정 | [.codex/hooks.json](../.codex/hooks.json) | `UserPromptSubmit`·모든 `PreToolUse` → `guard.sh` (10초), `Stop` → `verify.sh` (300초) | 설정 파일 존재·직접 검증과 사용자 신뢰 후 실제 이벤트 활성화는 별개. 실제 연결은 기존 기록상 `NOT_RUN` |
| 입력·테스트 보호 훅 | [.codex/guard.sh](../.codex/guard.sh) | stdin의 훅 JSON 또는 명령·패치를 검사. 통과 `0`, 차단 `2`; 입력을 실행하거나 원문을 출력하지 않음 | 실제 결제 키 접두사, `tests/` 쓰기·추가·삭제·이동·스냅샷 갱신 차단. 단순 조회·테스트 실행 허용. 경로 정규화·기존 심볼릭 링크 검사. 동적·인코딩된 명령 전체를 분석하는 샌드박스는 아님 |
| 완료 전 검사 훅 | [.codex/verify.sh](../.codex/verify.sh) | 저장소 루트에서 테스트·타입 검사를 모두 실행. 검사별 120초 제한, 검사 출력 stderr·훅 JSON stdout | 기존 스크립트는 첫 실패 시 `2`로 한 번의 수정을 요청하고, 이어진 Stop 실패 시 `continue: false`로 중단. 재시도 판정은 `stop_hook_active`, 누적 카운터 없음 |
| 생성물·환경 파일 제외 | [.gitignore](../.gitignore) | 의존성·빌드·커버리지·로그·`.env*` 등을 Git에서 제외 | 파일 무시 규칙이며 비밀값 검사나 실행 권한 차단을 대신하지 않음 |

## 중단 규칙과 기존 훅의 관계

| 상황 | 에이전트가 할 일 | 자동화 범위 |
|---|---|---|
| 훅이 작업을 차단 | 즉시 중단, 차단 이유·작업·사용자 결정 사항 보고 후 질문. 우회·비활성화 금지 | AGENTS.md의 사용자 지침이 기존 `verify.sh`의 자동 수정 요청보다 우선. 사용자 답변 전 수정·재시도 금지 |
| 정책상 테스트 변경 필요 | 구현 중단, 관련 번호·테스트·현재/제안 기대값·이유·영향을 정리하여 제시 | 테스트나 훅 설정을 직접 바꾸지 않음. 승인 후 별도 테스트 단계와 재확인 필요 |
| 같은 테스트 세 번 연속 실패 | 세 번째 실패 직후 중단, 세 번의 실행·오류·수정 시도를 보고 후 질문 | 에이전트 실행 이력으로 집계. 현재 `verify.sh`에는 이 집계가 없음. 더 이른 훅 차단 시 즉시 중단 |
| Stop 재검증 실패 | 실패로 보고하고 중단 | 훅 JSON 전달 성공의 종료 코드 `0`은 테스트 `PASS`가 아님. 수동 `--retry` 실패는 `1` |

이번 갱신은 AGENTS.md의 중단 지침과 이 구성표 작성이다. 훅 스크립트와 테스트·검사 설정은 변경하지 않았다.

## 검증 근거

### 2026-10-11 사용자 스위치 가드 재검증

- 사용자가 `strings(input).forEach(text => patch(text));`로 콜백 인수 오류를 직접 수정한 뒤 검증했다.
- `node scripts/harness/guard.test.cjs`: `PASS` — 임시 프로젝트에서 61개 사례 통과, 실패 0개.
- OFF일 때 테스트 쓰기·스냅샷 갱신 차단, ON일 때 허용. `.codex/` 스위치·훅·설정 쓰기는 두 상태 모두 차단한다. 조회와 테스트 실행은 허용한다.
- 경로 정규화·심볼릭 링크·상위 디렉터리 삭제·스위치 이동 목적지 보호를 검증했다. 스위치는 일반 파일만 인정하며 디렉터리·심볼릭 링크는 인정하지 않는다.
- 검증은 복사된 가드에 모의 도구 입력을 전달한 결과이다. 실제 프로젝트 스위치는 에이전트가 생성·삭제하지 않았다. 동적 코드 실행 전체를 통제하는 파일시스템 샌드박스를 의미하지 않는다.
- `npm run test:rules`: `PASS` — 기존 3개 파일, 55개 테스트 통과. `npm run typecheck`, `git diff --check`: `PASS`.
- 결제 승인·웹훅 기능 테스트 작성은 아직 완료하지 않았다. 토스 API 실호출·실제 웹훅 수신은 `NOT_RUN`.
- 아래 구성표와 과거 검증 기록 중 스위치 도입 이전의 무조건 테스트 쓰기 차단 설명은 이 갱신으로 대체한다.

| 검사 | 근거 | 상태·해석 |
|---|---|---|
| 구성 파일·지침·연결 대상 확인 | 이번 작업의 저장소 파일 정적 확인 | `PASS` — 구성 확인만 해당 |
| guard 허용·차단 및 verify 재시도 모의 검증 | [.codex/README.md](../.codex/README.md)의 기존 직접 검증 기록 | 기존 기록 `PASS` — 이번 작업에서 재실행하지 않음 |
| 규칙 테스트 | 이번 작업에서 `npm run test:rules` 실행 | `PASS` — 종료 코드 `0`, 3개 파일·55개 테스트 통과 |
| 타입 검사 | 이번 작업에서 `npm run typecheck` 실행 | `PASS` — 종료 코드 `0`, 타입 오류 없음 |
| 사용자 신뢰 후 실제 훅 이벤트 연결 | `.codex/README.md` | `NOT_RUN` — 설정 존재나 직접 실행만으로 활성화를 주장하지 않음 |
| 세 번 연속 실패 시 자동 차단 | AGENTS.md 및 현재 훅 소스 확인 | `NOT_RUN` — 자동 집계 구현 없음; 에이전트 지침으로 적용 |
| 모바일 브라우저·토스 테스트 실연결 | 이번 문서 작업 범위 밖 | `NOT_RUN` |
