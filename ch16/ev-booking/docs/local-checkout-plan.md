# 로컬 테스트 링크·booking 등록 후속 작업

## 확정한 정책과 등록 결과

승인된 자신의 유효 점유에는 `http://127.0.0.1:5180/checkout/<orderId>` URL, `amount: 3000`, `mode: test`를 반환한다. checkout HTTP 페이지·실제 결제창은 범위 밖이다. 승인 파일·가드·스위치는 에이전트가 변경하지 않는다. 이전 승인 보호 계약을 유지하고 orderId 재사용·재요청 정책을 새로 정하지 않는다.

`.codex/config.toml`에 booking 서버를 등록했다. command는 npm, args는 run·mcp, cwd는 프로젝트이다. NPM_CONFIG_LOGLEVEL=silent로 npm 배너를 억제하고 driver-a 시연 계정을 주입한다. request_payment의 도구별 approval_mode는 prompt이다. Codex 도구 호출 승인은 서버의 사람용 승인 파일 확인과 별개이다.

| 검사 | 상태 | 근거 |
|---|---|---|
| Codex CLI 등록 인식·TOML 파싱 | PASS | `codex mcp get booking --json`: 종료 0, 서버 이름·npm 명령·cwd·env 확인 |
| 도구별 prompt 정적 설정 | PASS | 설정 파일의 request_payment 테이블과 prompt 값 확인 |
| 등록 명령의 실제 stdio | PASS | 공식 SDK 클라이언트 → npm run mcp, initialize·tools/list·search 통과. 강남역 1km DC콤보 검색 28개 후보 |
| 새 로컬 URL 계약 RED | FAIL(구현 전 기대된 실패) | 사용자 계획 확인·스위치 활성화 후 tester 작성, 지정 테스트 1 FAIL / 2 PASS. 실제 링크 제공자 미구현 |
| 새 로컬 URL 구현·GREEN | PASS | 테스트 커밋 93faed8·스위치 해제 후 implementer 구현. 신규 3/3, 전체 171/171, 타입 검사 통과 |
| Codex 승인 UI에서 매 호출 확인 | NOT_RUN | 설정과 직접 SDK 연결만 검증. 직접 SDK 호출은 Codex의 사용자 승인 UI 검증이 아님 |
| 승인 파일 생성·checkout 페이지·실제 결제 | NOT_RUN | 이번 작업에서 실행하지 않음 |

Python의 tomllib 검증 시도는 설치된 Python에서 모듈이 없어 실패했다. TOML 파싱의 성공 근거는 실제 Codex CLI 설정 로드이며 Python 검증 통과로 보고하지 않는다.

## 사용자 확인을 위한 테스트 인계

신규 파일 계획: `tests/mcp/local-checkout.test.ts`. 기존 커밋 테스트는 수정하지 않는다. 현행 `localDemoDependencies`의 실제 링크 제공자를 사용하며, 시계·계정·입력 JSON·승인 파일 존재 확인만 주입/모의한다. 실제 승인 폴더·파일은 생성하지 않는다.

| 테스트 이름 제안 | 입력 | 기대 결과 |
|---|---|---|
| AC-18-11 승인된 유효 점유는 지정 로컬 URL과 3000원 테스트 모드를 반환한다 | 자신의 유효 점유, 파일 존재 모의 true, 실제 런타임 링크 제공자 | URL의 origin=http://127.0.0.1:5180, path=/checkout/ + 비어 있지 않은 orderId, amount=3000, mode=test. 결제·네트워크·확정 예약 없음 |
| AC-18-11 미승인 점유에는 로컬 링크를 만들지 않는다 | 파일 존재 모의 false | APPROVAL_REQUIRED와 요약·승인 명령, 성공 URL 없음 |
| AC-18-11 만료 점유에는 승인 파일이 있어도 로컬 링크를 만들지 않는다 | 정확히 생성+10분, 파일 존재 모의 true | 거절, 성공 URL 없음, 기한 연장 없음 |

헌법 III에 따라 테스트 파일을 먼저 작성하고 구체적인 입력·기대값의 사용자 확인 및 실제 실패를 확인한 뒤 구현한다. 테스트 작성 당시 제공자는 PAYMENT_LINK_NOT_CONFIGURED로 거절했으므로, 새 테스트는 import 오류가 아닌 링크 동작 불일치의 RED를 관찰했다. AGENTS.md의 정책 변경 사람 인계·스위치 제약을 따른다.

공식 설정 근거: [Codex MCP 구성](https://learn.chatgpt.com/docs/extend/mcp?surface=cli), [mcp_servers 도구별 approval_mode](https://learn.chatgpt.com/docs/config-file/config-reference), [개별 MCP 도구 prompt 안내](https://learn.chatgpt.com/docs/cyber-safety/recommended-configuration). 실제 세션에서의 승인 UI 적용은 별도 검증해야 한다.

## tester 실행 인계

사용자는 스위치를 켜고 위 세 테스트 계획을 확인한 뒤 작성과 실제 실패 확인을 명시적으로 요청했다. tester가 `tests/mcp/local-checkout.test.ts`만 새로 작성했다. 기존 테스트·src/·설정·승인 경로·스위치·가드는 변경하지 않았다.

실행 명령은 `npx vitest run tests/mcp/local-checkout.test.ts`이며 한 번 실행했다. 종료 코드 1, 3개 중 1 FAIL / 2 PASS, 수집·import·환경 오류는 없었다. 첫 테스트의 실제 런타임 링크 제공자는 PAYMENT_LINK_NOT_CONFIGURED를 던져 성공 응답 단언(작성 당시 63줄)이 실패했다. 미승인·정확히 10분 만료 보호는 PASS였다. 실패 테스트의 연속 실패 횟수는 1회이다.

기능 RED 확인 뒤 재실행·구현하지 않고 멈춘다. 사용자 스위치 해제 뒤 implementer에게 이 실패 증거와 승인된 테스트를 인계한다. Stop 훅이 예상된 테스트 실패를 보고해도 사용자 구현 전 중단 지시를 우선한다.

## 커밋 후 구현·리뷰 결과

사용자는 스위치를 끄고 테스트를 커밋 `93faed8`로 고정한 뒤 implementer 구현·reviewer 검토를 승인했다. 시작 시 작업 트리는 깨끗했고 스위치 파일은 없었다. tester의 실제 RED와 뒤이은 Stop 훅 FAIL을 인계했으며, implementer는 실패를 재실행하지 않고 먼저 구현했다.

| 순서 | 인계 | 전달 내용·결과 |
|---|---|---|
| 1 | tester → implementer | 승인된 신규 3개 테스트와 실제 1 FAIL / 2 PASS, 링크 제공자 미구현 원인 |
| 2 | implementer → reviewer | src/mcp/stdio.ts의 UUID 로컬 URL 생성과 안내 변경. 신규 3/3, 전체 8파일 171/171, npm run typecheck PASS. 기존 테스트·승인/소유/만료 검사는 변경 없음 |
| 3 | reviewer(GPT-6-Astra) → 부모 | P1~P3 지적 없음. 고정 URL·안전한 UUID·금액/모드·승인 보호·prompt 설정·테스트 불변을 정적으로 대조. 재실행 없이 실행 증거 인계 확인 |

부모가 `git diff --exit-code -- tests`와 `git diff --check`를 실행해 종료 0을 확인했다. 승인 테스트 파일은 변경하지 않았다. P1 수정·재리뷰는 0회였다.

현재 완료 범위는 승인 보호를 통과한 요청에 지정 URL 문자열과 금액·테스트 모드를 반환하는 기능이다. 승인 파일 존재는 테스트에서 모의했고 실제 런타임 링크 제공자는 그대로 실행했다. 실제 승인 파일 생성·checkout HTTP 페이지·결제·Codex 매 호출 승인 UI는 NOT_RUN이다. 승인 명령·가드·스위치·승인 경로는 이번 구현에서도 변경하거나 실행하지 않았다.
