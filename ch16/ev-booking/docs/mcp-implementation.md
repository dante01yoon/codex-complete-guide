# 16장 MCP 구현·리뷰 실행 기록

기준 테스트 커밋: `5b15293` (`test: booking MCP tools (approved red); guard protects approvals`). 사용자가 갱신 테스트를 커밋하고 테스트 작성 스위치를 끈 뒤 구현·리뷰를 승인했다. 시작·최종 확인에서 테스트 변경은 없었다. 가드와 승인 경로는 변경하지 않았으며 사람용 승인 명령을 실행하지 않았다.

## 에이전트가 주고받은 내용

| 순서 | 보내는 역할 → 받는 역할 | 전달 내용 | 결과 |
|---|---|---|---|
| 1 | planner → tester | T-50~52의 작업 단위, 기존 AC 연결, 서비스·등록 API 제안, 미정 정책과 선행 부족 | 읽기 전용 계획 완료 |
| 2 | tester → 사용자 | 최초 55개 테스트의 이름·AC·입력·기대 결과 | 사용자 이름 확인 |
| 3 | 사용자/부모 → tester | C-12의 사람용 터미널 승인 파일 결정과 갱신된 문서 | tester가 승인 테스트를 갱신해 총 59개 작성; 사용자가 커밋·구현 승인 |
| 4 | 부모 → implementer | 승인 커밋·스위치 제거, 테스트 불변·src/ 소유권, 먼저 공개 인터페이스만 준비할 범위 | 골격 준비 및 실제 RED 실행: 59/59 FAIL, import·수집 오류 0 |
| 5 | implementer/부모 → tester → implementer | RED 명령·결과와 골격, AC-18-1~10 / T-50~53 계약 | tester가 정적으로 대조해 인계; 실패 실행은 implementer가 수행했고 tester는 중복 실행하지 않음 |
| 6 | implementer → 부모/reviewer | src/ 구현, MCP 59개·전체 168개·타입 검증 결과, 테스트 불변, 런타임 제한 | MCP 59/59 PASS, 전체 168/168 PASS, typecheck PASS |
| 7 | 부모 → reviewer | 실제 SDK stdio 연결·검색·점유·미승인 결과, npm 연결 변경 | 실제 원본 검색 28개 후보, 10분 점유, APPROVAL_REQUIRED PASS |
| 8 | reviewer(GPT-6-Astra) → 부모 | 읽기 전용 P1~P3 검토, 원본 스키마 대조, 범위·제한 | 지적 없음. P1 수정·재리뷰 0회 / 최대 2회 |

프로젝트 커스텀 역할 이름은 현재 협업 런타임이 직접 인식하지 않아 default 서브에이전트가 해당 TOML을 읽고 역할 지침을 적용했다. reviewer는 실제 `gpt-6-astra` 모델로 실행했다. 부모는 package.json·lockfile·문서와 독립 stdio 검증을 담당했고 implementer는 src/만 변경했다.

## 변경 파일

- `src/mcp/booking-server.ts`: 세 도구의 서비스·입력 스키마·핸들러 연결, 점유와 승인 파일 확인.
- `src/rules/booking.ts`: 자격·커넥터·예약 시간·10분 만료 순수 규칙. 기존 겹침 함수를 재사용.
- `src/mcp/approval-path.ts`: 안전한 holdId와 승인 경로 계산.
- `src/mcp/approve.ts`: 사람이 직접 실행할 승인 CLI와 모의 가능한 파일 생성 계약. 이번 검증에서 실제 CLI는 실행하지 않음.
- `src/mcp/stdio.ts`: 공식 MCP SDK stdio 연결, 원본 JSON 읽기, 프로세스 내 메모리 점유, 읽기 전용 승인 파일 어댑터.
- `package.json`, `package-lock.json`: SDK·Zod·tsx 의존성, mcp·approve 실행 스크립트.
- `docs/agents.md`, 이 기록 및 `docs/tasks.md`: 승인 후 진행 상태·인계·검증 범위 기록.

## 실행 증거와 범위

| 검사 | 상태 | 근거·한계 |
|---|---|---|
| 공개 함수의 미구현 RED | FAIL(의도된 구현 전 실패) | `npx vitest run tests/mcp/booking-server.test.ts`: 59/59 실제 함수 호출 실패. import·수집 오류 아님 |
| MCP 모의 계약 | PASS | 같은 명령: 59/59 통과. fixture·파일 존재/CLI 쓰기·결제 링크 제공자 모의 |
| 전체 테스트 | PASS | `npx vitest run`: 7개 파일, 168/168 통과 |
| TypeScript | PASS | `npm run typecheck`: 종료 0, 최종 stdio 포함 |
| 테스트 보존·패치 형식 | PASS | `git diff --exit-code -- tests` 및 `git diff --check`: 종료 0 |
| 실제 MCP 초기화·도구 등록 | PASS | 공식 SDK Client와 StdioClientTransport로 실제 서버 프로세스 연결, tools/list 3개 이름 일치 |
| 실제 원본 검색·점유 | PASS | 강남역 좌표 `(37.498095,127.02761)`·1km·DC콤보 검색 28개 후보. 첫 후보 19:00~19:30 점유, 생성+600000ms 기한 |
| 실제 미승인 응답 | PASS | request_payment → APPROVAL_REQUIRED·금액 3000·승인 명령. 승인 파일·실결제 생성 없음, 검증 프로세스 종료 |
| reviewer 정적 검토 | PASS | P1~P3 지적 없음. 승인/금액 우회·소유자·만료·경로·규칙 분리·변경 범위 확인 |
| 원본 스키마 대조 | PASS | reviewer가 stations 75,891건·statuses 1,454건을 읽고 필수 문자열 스키마 불일치 0건 확인 |
| 승인 후 실제 테스트 링크 | BLOCKED | stdio 런타임 링크 제공 방식 미설정, PAYMENT_LINK_NOT_CONFIGURED. AC-18-8 모의 계약만 PASS |
| 사람이 실행하는 실제 승인 CLI | NOT_RUN | AC-18-10의 모의 생성 계약만 PASS. 코덱스는 승인 명령 실행 금지 |
| 브라우저·토스 실연결·배포 | NOT_RUN | 실제 결제·외부 배포 수행하지 않음 |

reviewer는 implementer의 테스트·타입 결과와 부모의 stdio 실행 증거를 인계받았으며 중복 실행하지 않았다. 구현 중 각 테스트는 RED 1회 이후 GREEN으로 해소됐다.

## 로컬 실행과 제한

Node.js 24에서 `npm run --silent mcp` 또는 `node --import tsx src/mcp/stdio.ts`로 서버를 시작한다. 예를 들어 사람이 실행할 터미널에서 `BOOKING_DEMO_USER_ID=driver-a BOOKING_DEMO_NOW=2026-10-06T18:00:00+09:00 npm run --silent mcp`로 시연할 수 있다. stdio에는 프로토콜 메시지만 쓰고 안내는 stderr에 쓴다.

`BOOKING_DEMO_USER_ID`는 신뢰된 프로세스 설정의 시연 계정이며 로그인 인증이 아니다. `BOOKING_DEMO_NOW`는 진행하는 시연 시계의 시작점이며 컴퓨터 시간을 바꾸지 않는다. 메모리 점유와 원자성은 동일 저장소를 공유하는 프로세스 내부 범위이며 재시작 시 사라진다. 여러 MCP 프로세스 간 공유·영속 저장·실제 로그인은 미구현·미확정이다.

사람이 직접 실행할 명령은 `npm run approve -- <holdId>`이다. 서버는 해당 파일을 읽어 확인하며 에이전트는 이 명령이나 승인 파일 생성으로 사람 승인을 대신하지 않는다. 승인 후 실제 링크 제공 방식이 미정이므로 전체 결제 링크 기능 완료나 토스 연결 통과로 보고하지 않는다.

SDK 연결 참고: [공식 MCP 서버 개발 문서](https://modelcontextprotocol.io/docs/develop/build-server). 이 링크는 프로토콜 연결 방식의 근거이며 프로젝트 검증 결과는 위 실제 실행에서 얻었다.
