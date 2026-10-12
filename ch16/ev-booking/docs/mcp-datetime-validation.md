# MCP 날짜·시작 시각 확장 검증 진행 기록

범위: T-59, US-04·18, AC-04-1·2·3와 AC-18-1·3·8·10·13~15의 계획상 부분.
승인 테스트 기준 커밋: `23c7e363715f46f660877ab175f13a4a6eefe61a`.
계약과 완료 관문은 [계획](mcp-datetime-plan.md), 정책은 [수용 기준](acceptance.md)을 따른다.
이 기록은 부모·테스트 담당이 전달한 실행 근거를 정리한 것이며 계획 담당이 테스트를 재실행한 결과가 아니다.

## 사용자 확인과 구현 전 상태

- 사용자가 “74개 테스트 확인, 다음 단계 진행”이라고 명시 확인했다. 일반 구현 요청·스위치 켜짐으로 확인을 추정하지 않았다.
- 승인 파일: `tests/rules/mcp-datetime.test.ts`39개, `tests/mcp/datetime-service.test.ts`30개,
  `tests/mcp/datetime-stdio.test.ts`5개, 총74개. 기존 테스트 파일·기대값은 보존한다.
- 작성 단계 테스트 담당의 `npm run typecheck` exit0/PASS, diff 정적 검사 PASS는 기능 실행과 구분한다.
- 구현 전 신규 순수 함수가 없고 service 검색 schema가 기존7시 입력만 받아 명시 입력을 거절했다.
  아래 실패는 대상 기능 미구현·계약 불일치이며 환경·키 오류가 아니다.

## Red 실행과 중단 이력

시각은 전달받은 실행 로그 표시값이다. 시간대가 확인되지 않은 로그 시각을 서울 예약 시각으로 해석하지 않는다.

| 로그 시각 | 실행 주체·대상 | 확인 결과 | 근거와 한계 |
|---|---|---|---|
| 10:20:12 | Stop 훅 전체 테스트 | FAIL:54개, PASS:250개 | 신규rules39·service13·stdio2 실패. Stop 실패 알림 자체를 실제 명령 차단으로 보지 않음 |
| 10:21:22 | 테스트 담당 직접 rules Red | exit1,39/39 FAIL | `resolveMcpBookingDateTime`이 undefined인 미구현 실패 |
| 10:21:29 | 테스트 담당 직접 service Red | exit1,13 FAIL·17 PASS | 명시 date/startTime 입력을 기존schema가 거절. 이미통과한17개는 Red 착수 근거로 삼지 않음 |
| 직접 stdio 호출 | 테스트 담당, 부모가 interrupt | 완료 결과 미확인 | 도구가 userabort를 반환. 실행 시도는 있었으나 확정 FAIL/PASS를 주장하지 않음. 완료 검증은 NOT_RUN/미확인 |
| 10:21:46 | 사용자 확인 후 Stop 훅 전체 테스트 | FAIL:54개, PASS:250개 | 신규rules39·service13·stdio2 실패. stdio의 확인된 실패 근거는 이 훅 결과이며 직접실행 결과로 소급하지 않음 |

직접 Red 실행 명령은 다음과 같으며 각각 별도 도구 호출이었다.

```sh
npx vitest run tests/rules/mcp-datetime.test.ts
npx vitest run tests/mcp/datetime-service.test.ts
npx vitest run tests/mcp/datetime-stdio.test.ts
```

실패한 사례 식별은 각 승인 파일의 테스트 이름으로 추적하며 부모가 실행 이력을 통합 관리한다.

- `tests/rules/mcp-datetime.test.ts`의 같은39개 사례: 10:20:12 Stop → 직접 Red → 10:21:46 Stop,
  각3회 연속 실패에 도달했다. `tests/mcp/datetime-service.test.ts`의 같은13개 사례도 같은 순서로3회다.
  중간의 다른 파일 실행·도구 전환으로 횟수를 초기화하지 않는다.
- stdio2개 사례는 확인된 Stop 실패2회이다. 중단된 직접 stdio 시도는 실패 횟수에 더하지 않는다.
- 동시에 부모의 스킬 읽기 명령이 PreToolUse `guard.sh`에 실제 차단됐다. 대상 명령:
  `sed -n '160,335p' /Users/dante/.codex/plugins/cache/openai-curated-remote/superpowers/6.4.2/skills/subagent-driven-development/SKILL.md`.
  오류 요약은 “.codex/ 스위치·훅·설정을 변경할 가능성이 있는 명령은 금지됩니다.”였다.
  부모는 테스트 담당을 interrupt하고 당시 사용자 질문에는 `sed` 가드 차단만 보고했다.
  이 시점에3회 연속 실패를 함께 질문했다고 소급해서 주장하지 않는다.
- 추가 Stop10:21:46의 같은54FAIL/250PASS 알림에는 새 변경이 없고 가드 재개 답변 대기라고 응답했다.
  사용자 “계속해 줘” 수신 후 테스트 담당의 두 직접 Red 실행 이력을 인계받아 같은rules/service사례3회 집계를 확인했다.
  부모는 그때 commentary로3회 실패와 현재 중단 상태에 대한 계속 지시 적용을 알린 뒤 구현 담당에게 인계했다.
- 당시 상태는 기능 검증 FAIL, 차단 때문에 진행하지 못한 후속 작업 BLOCKED였다.
  새 기능 수정·재실행으로 차단을 우회하거나 훅·스위치·검사 설정을 변경하지 않았다.

## 사용자 재개 승인과 인계

최신 사용자 답변:

> 응. 읽기만 하는 명령이 막히면 앞으로는 묻지 말고 cat으로 다시 해도 돼. 계속해 줘.

- 부모는 위 “계속해 줘” 수신 후 직접 Red 이력을 받아3회 실패를 확인했고,
  그 사실과 재개 지시 적용을 commentary로 알렸다. 이 답변을 실제 읽기 차단과 실패 후 중단 상태에 대한 재개 승인으로 적용했다.
  승인된74개와 기존 Red 증거를 src 구현 담당에게 인계하고 Red를 반복하지 않았다.
- 읽기 명령 차단 후 `cat`으로 다시 읽는 허용은 이번 세션의 사용자 명시 예외이다.
  사용자 답변 후 같은 스킬 파일을 단독 `cat`으로 읽어 exit0을 확인했다.
  AGENTS.md·가드·훅·검사 설정을 수정하거나 쓰기/기능 실행의 차단 우회로 확대하지 않는다.
- 기존3회 실패 이력은 보존한다. 차기 같은 사례 실패가 발생하면 즉시 수정·재실행을 멈추고 사용자에게 보고한다.
- 구현 담당은 승인 테스트를 변경하지 않고 `src/**`만 담당했다. 구현 후 테스트 불변과 Green 근거는 아래와 같다.

## 구현과 Green

- 구현 담당 변경 파일은 `src/rules/mcp-booking.ts`, `src/rules/index.ts`,
  `src/mcp/booking-service.ts`, `src/mcp/server.ts` 네 개이다.
  순수 날짜·시각 정규화, 공개 export, 신규 검색 입력·service 연결과 도구 설명을 구현했다.
- 최초 Green: 10:25:20 신규74개 PASS. 10:25:33 전체304개 PASS(구현 담당 전달 근거).
- 부모 독립 확인: 10:27:15 `npm run test:rules`, exit0,15파일304/304 PASS.
  `npm run typecheck`와 `git diff --check`도 exit0/PASS였다.
- 부모의 단독 `git diff HEAD -- tests`는 exit0·빈 diff였다. 승인 기준의 테스트 파일·기대값은 변경하지 않았다.
- 신규 규칙39개·서비스30개·SDKstdio5개의 Green은 각각 순수 판정, 격리 저장소,
  실제 시험 stdio 프로세스의 도구 발견·호출 검증이다. 부모 현재 세션의 캐시된 도구 schema 갱신 검증은 아니다.
- GPT-6-Astra 읽기 전용 리뷰가 완료됐다. 명세 준수·코드 품질에서 수정이 필요한 확인된 지적은0건이다.
  제공된src diff와 현재src diff가 일치했다(SHA-256 `30ed34c4a7f3e78b88fd7fa4b2ecee8e50efb693c00500e31d6e7373c3e701dd`).
  리뷰어는 부모10:27:15 전체304/304·타입·diff PASS와 승인 테스트 빈diff 근거를 검토했으며 테스트를 재실행하지 않았다.
- 시간대 독립성은 명시 서울 오프셋·날짜 경계 테스트와 코드 리뷰로 확인한 부분이다.
  여러 호스트 시간대에서 프로세스를 각각 실행하는 검증은 NOT_RUN이다.

## 실행 예제와 남은 실사용 확인

```js
search_chargers({
  location: '강남역', connector: 'DC콤보',
  date: '2026-10-13', startTime: '19:00', durationMinutes: 30,
})
```

위 예제의 날짜·시각은 서울 시간이며 실행 시 서비스 시계의 현재~7일 조건을 충족해야 한다.
새 schema를 사용하려면 MCP 서버 프로세스와 도구 연결을 다시 시작/연결하여 도구 목록을 갱신해야 한다.
부모의 현재 세션 도구 metadata 읽기에서는 캐시된 검색 schema가 여전히 기존 `timeText:'7시'`만 지원하는 것으로 확인됐다.
새 서버 등록은 격리 SDK 시험에서 PASS이나 현재 세션의 재접속/schema 갱신과 새 필드 사용 검증은 NOT_RUN이다.
실제 프로젝트의 hold 생성·인간 승인·링크/결제 요청·토스 승인/환불도 NOT_RUN이며,
도구 확장 검증이 사용자 요청 시간의 실제 예약 생성을 뜻하지 않는다.

## 현재 검증 상태

| 항목 | 상태 | 범위 |
|---|---|---|
| C-13 명시입력 계약·문서 갱신 | 반영 완료 | 기존7시 유지·서울 date/startTime·누락/혼용/잘못날짜 거절 |
| 사용자74개 테스트 확인 | 확인 수신 | 기준 커밋과 신규3파일 |
| 작성 단계 타입·diff 검사 | PASS | 정적 확인이며 기능 Green 아님 |
| 직접 rules/service Red | FAIL |39개 함수 미구현·13개 명시입력 불일치 |
| 직접 stdio 완료 결과 | NOT_RUN/미확인 | 중단된 시도와 완료된 검증을 구분 |
| Stop 전체 Red | FAIL |54 FAIL·250 PASS, 신규stdio2 실패 포함 |
| 읽기 차단·3회 실패 중단 | BLOCKED 이력 | 사용자 최신 답변으로 재개 승인, 이력 유지 |
| src 구현 | 한정 구현 완료 | 위 네 소스 파일, Green·읽기 리뷰 완료 |
| 구현 후 Green·전체 회귀·테스트 불변 | PASS | 신규74·전체304, 부모 독립304/304·정적검사·빈tests diff |
| GPT-6-Astra 리뷰 | PASS | 확인된 수정 필요 지적0건, 부모 실행 근거 검토·재실행 없음 |
| 현재 세션 도구 metadata | 읽기 확인 | 기존7시 schema 유지, 신규date/startTime 갱신 아님 |
| 여러 호스트 시간대 실행 | NOT_RUN | 명시오프셋·경계테스트·코드리뷰와 구분 |
| 실제 Codex 재접속·schema 캐시 갱신·hold 생성·인간 승인·토스 연결 | NOT_RUN | 격리stdio 결과로 대신하지 않음 |

T-59의 서버 코드·순수 규칙·격리 서비스/SDKstdio 범위는 사용자 확인·Red·중단 후 명시 재개·구현·Green·읽기 리뷰를 완료했다.
현재 세션의 도구 재접속과 실제 예약 생성·인간 승인·토스 연결은 NOT_RUN이다.
전체 예약 서비스 완료나 실제 충전소 이용을 보장하는 검증으로 확대하지 않는다.
