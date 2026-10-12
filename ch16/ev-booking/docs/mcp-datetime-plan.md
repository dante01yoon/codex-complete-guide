# MCP 날짜·시작 시각 입력 확장 계획

> **For agentic workers:** 역할 실행은 `docs/agents.md`의 계획 → 테스트 → 사용자 확인 → 실제 실패 → 구현 → GPT-6-Astra 리뷰 순서로 한다. 실행 단계에는 `superpowers:subagent-driven-development`를 적용하되 프로젝트의 역할 경계와 사용자 확인 관문을 우선한다.

**Goal:** `search_chargers`가 명시적인 날짜와 시작 시각을 받아 기존 가상 예약 구간을 검색하도록 확장한다.

**Architecture:** MCP schema와 service는 입력을 전달하고, 서울 시간 정규화와 예약 시간 판정은 `src/rules`의 순수 함수에서 수행한다. 검색이 반환한 epoch 구간을 기존 `hold_charger`에 그대로 전달하며 독립 10분 점유·인간 승인·HTTP 주문 흐름을 재사용한다.

**Tech Stack:** 기존 Node.js 24, TypeScript, Vitest, 공식 MCP SDK v2.3.1, 로컬 JSON.

**Spec:** `docs/prd.md` 4.2·7의 US-18, `docs/acceptance.md` AC-04-1·2·3와 AC-18-1·3·8·10·13~15, `docs/tasks.md` C-13·T-59. 사용자가 “이 계약으로 진행”을 선택하여 명시 날짜·시각 입력과 기존7시 호환 계약을 확정했다. 테스트 사용자 확인·실행·구현은 후속 관문이다.

## 범위와 제약

- 사용자 요청: “날짜랑 시작 시각을 받을 수 있게 도구를 고쳐 줘. 같은 그래프로 하고, 테스트 스위치는 켜 뒀어.”
- 작업 번호 T-59. T-57 전체 자연어 해석·로그인·복구·다른 장소 지원을 구현하는 요청으로 확대하지 않는다.
- 현재 확정 정책: 서울 시연용 시계, 시작 현재 이상·현재+7일 이하, 매시 00/30분 00초, 길이 30/60/90분. 종료는 7일을 넘어도 된다.
- 장소는 기존 `location:'강남역'`, 커넥터 필수, 정확히 1km 포함·정확한 24시간 안내·원본 자격·겹침 검사 유지.
- 테스트 스위치는 사용자 관리 사항이다. 켜져 있다는 답변은 구체적인 테스트 파일·기대값의 명시 확인을 대신하지 않는다.
- 계획 담당은 문서만, 테스트 담당은 `tests/**`만, 구현 담당은 `src/**`만 변경한다. 실제 `.codex/approvals/` 접근·승인 명령 대행·훅/스위치 변경·원본 수정·배포를 하지 않는다.
- 실제 훅 차단 시 즉시 중단한다. 테스트 경로를 참조하는 셸 명령은 각각 단독 도구 호출로 실행한다.

## 선행 완료의 실제 근거

| 선행 범위 | 확인 근거 | 이번에 의존하는 부분 |
|---|---|---|
| T-53 순수 규칙 | `docs/mcp-booking-validation.md`: 사용자 확인·미구현 Red·34/34 Green·전체190/190·읽기 리뷰 | 기존 오늘19시 정규화, 검색 후보·점유·링크 순수 계약 |
| T-54~57 한정 MCP 서버 | `docs/mcp-server-validation.md`: 기준 c047d35, 신규 기능 Red, 전체218/218 Green, 원본 병합 성능 수정·재리뷰 | schema/service, 원본 조회·자격·거리·충돌·원자 점유·SDK 도구 호출 |
| T-58 HTTP 연결 | `docs/mcp-payment-page-validation.md`: 기준 ef6bbc8, 신규12개 Red, 전체230/230 Green·정적 검사·재리뷰 | 점유 구간을 HTTP 주문에 보존하는 기존 경로의 회귀 대상 |
| 현재 소스의 계약 | `src/mcp/booking-service.ts`, `src/mcp/server.ts`, `src/rules/mcp-booking.ts`, `src/rules/mcp-service.ts` 읽기 | searchSchema는 7시 고정, searchChargers는 resolver 후 mcpTimeAllowed 호출. hold는 이미 startMs를 받음 |

위는 과거 실행 기록과 현재 소스의 읽기 확인이다. 이번 날짜 확장 테스트를 실행한 증거가 아니며 전체 T-01~49 완료를 뜻하지 않는다. 과거 검증 문서의 당시 C-12 보류/주소 생성 한계는 PRD·tasks의 후속 확정과 T-58 기록을 함께 읽는다.

## C-13 사용자 결정

부모가 다음 묶음 계약을 질문했고 사용자가 “이 계약으로 진행”을 선택했다(2026-10-12). 아래 계약을 이번 범위에 확정한다.

1. 신규 입력은 `date:'YYYY-MM-DD'`와 `startTime:'HH:mm'`이며 서울 시간으로 해석한다.
2. 기존 `timeText:'7시'`는 오늘19시 호환으로 유지한다. 명시 날짜/시각과 혼용·한 필드 누락·잘못된 달력 날짜/시각은 거절한다.
3. 기존 현재~+7일·00/30분·30/60/90분 정책을 그대로 적용한다.

기존 AC-18-3와 기존 규칙/서비스/stdio 테스트 기대값을 유지하고 신규 명시 입력 경로를 추가한다. 이번 답변은 C-13의 명시 입력 부분만 해결한다. 임의 자연어 날짜·시각·장소, 모호한 표현의 재질문 정책은 미정으로 유지한다. 상대적인 “내일”을 서버가 해석하는 기능은 이번 범위에 넣지 않는다. 대화 측에서 서울 기준의 확정 달력 날짜를 도구에 전달한다.

## 공개 계약

### MCP 도구와 service

```ts
// 호환 유지 확정. 혼용과 불완전한 한 쌍은 런타임에서 거절한다.
type SearchTimeInput =
  | { date: string; startTime: string; timeText?: never }
  | { timeText: '7시'; date?: never; startTime?: never };
type SearchInput = SearchTimeInput & {
  location: '강남역'; connector: ConnectorKind;
  durationMinutes: 30 | 60 | 90;
};
// 기존 searchChargers(value: unknown) 공개 진입점과 반환 구조 유지.
// 성공: { range: {startMs, endMs}, candidates: [...] }
// 형식·달력·누락·혼용 오류: BookingError('INVALID_ARGUMENTS')
// 유효 날짜이지만 기간/시작 단위가 정책 위반: BookingError('INVALID_TIME')
```

오류 코드는 기존 service 계약을 재사용하는 내부 기술 계약으로 선택했다. schema는 도구의 `tools/list`에서도 신규 입력을 발견할 수 있는 형태를 사용하고 unknown 필드·신뢰 context 위조를 거절한다. 최상위 object schema에 optional 필드와 exclusive 검증을 두는 방식이면 SDK 도구 등록의 object schema를 유지할 수 있다. 구체 Zod 조합은 합의된 SDK 안에서 구현 담당이 결정한다. durationMinutes가30/60/90이 아니면 기존 schema의 `INVALID_ARGUMENTS`이고, 형식상 유효한15/45분 시작이나 기간 밖 시작은 `INVALID_TIME`이다.

### 날짜 정규화 순수 함수

기존 `resolveMcpBookingTime`의 입력·반환은 유지한다. 신규 함수의 내부 기술 계약:

```ts
export function resolveMcpBookingDateTime(input: {
  readonly nowMs: number;
  readonly date: string;
  readonly startTime: string;
  readonly durationMinutes: number;
}): {
  readonly range: TimeRange;
  readonly withinBookingWindow: boolean;
} | null;
```

- 문자열은 정확한 네 자리 연도·두 자리 월일과 24시간제 두 자리 시분을 검증한다. `null`은 형식 또는 실제 달력/시각 오류이다. 공백 제거·날짜 자동 보정·다음 날 이월로 오류 입력을 수용하지 않는다.
- 서울 UTC+09:00에서 초·밀리초0의 epoch로 변환하고, 결과를 서울 달력으로 다시 비교하여 `2026-02-30` 같은 Date 자동 보정을 막는다. 호스트 시간대에 의존하지 않는다.
- 구간 종료는 시작+durationMinutes이며 `withinBookingWindow`는 시작의 현재~+7일 경계만 나타낸다. 매시00/30·길이 판정은 기존 `mcpTimeAllowed(range, nowMs)`를 호출해 최종 적용한다.
- 새 함수는 `src/rules/index.ts`에서 export한다. service는 입력 형식 선택·null의 오류 변환과 기존 시간 판정 호출만 하고 도메인 규칙을 복제하지 않는다.
- `hold_charger`는 검색이 반환한 `range.startMs`와 기존 length/connector/식별자/requestId를 받으며 계약 변경이 필요하지 않다.

## 신규 AC와 T-59

사용자 답변을 PRD US-18의 합의, 아래 AC, tasks C-13/T-59에 함께 반영했다.

| 신규 기준 | GIVEN / WHEN / THEN |
|---|---|
| AC-18-13 명시 날짜·시작 시각 | 서울 now=2026-10-12 10:00, 강남역/DC콤보와 date=2026-10-13/startTime=15:00/30분 → 검색 → 서울13일15:00~15:30의 epoch 반환. startTime=19:00이면13일19:00~19:30. 오늘19시로 덮어쓰지 않음 |
| AC-18-14 입력 오류·형식 독립 | 날짜/시각 한 쌍 또는 기존7시 계약 → 혼용·누락·잘못된 날짜/시각 입력 → 오류이며 후보·점유·링크·결제 효과 없음. legacy 단독은 AC-18-3 유지 |
| AC-18-15 기존 시간 정책·도구 연결 | 명시 날짜 구간 → 검색 및 SDK tools/list/tools/call → AC-04-1·2 경계 적용, 새 필드 발견·호출 성공, 신뢰된 사용자/시계/승인 인수 불허. 반환 구간으로 hold하면 같은 구간·원래생성+10분 유지 |

T-59: 날짜·시작 시각 검색 입력의 schema → 순수 정규화 → service → stdio 연결과 해당 범위 검증. US-04·18; AC-04-1·2·3, AC-18-1·3·8·10, 신규13~15. 선행 C-13의 이번 명시 입력 계약 답변과 문서 갱신, T-54~57 한정 구현 근거를 확인했다. T-58은 회귀 근거로 이용하며 결제 페이지를 재구현하지 않는다.

## 테스트 담당 인계

신규 파일은 `tests/rules/mcp-datetime.test.ts`, `tests/mcp/datetime-service.test.ts`, `tests/mcp/datetime-stdio.test.ts`이다. 기존 fixtures를 읽어 재사용하며 기존 테스트 파일·기대값은 변경하지 않는다. fixture는 격리 root만 사용한다.

| 검증 부분 | 입력·기대 결과 |
|---|---|
| 신규13·서울 변환 | now `2026-10-12T10:00:00+09:00`, date13일/startTime15:00·19:00, 30분 → 정확한 시작·종료 epoch. 60·90분 길이도 보존 |
| 신규13·날짜 경계 | now `2026-10-12T00:00:00+09:00`는 UTC 전날 → date12일00:00을 해당 서울 날짜로 유지. 유효 윤년2028-02-29, 월말/연말23:30+90분은 다음 날 종료 보존 |
| AC-04-1·신규15 | now12일10:00 → 같은10:00과19일10:00 포함,12일09:30·19일10:30 거절.19일10:00+90분 종료11:30 허용. now10:00:00.001이면10:00 시작 과거 거절 |
| AC-04-2·신규15 | 00/30분 허용,15/45분 거절. 길이30/60/90 허용,15/45/120 거절 |
| 신규14·달력/형식 | 2026-02-29,2026-02-30,13월/0월/0일/32일,2026-1-02, slash날짜, 빈 문자열, 앞뒤공백,24:00·25:00·19:60·7:00·19:00:00·오프셋 첨부 → INVALID_ARGUMENTS |
| 신규14·형식 독립 | 필드둘다없음, date만, startTime만, date/startTime+timeText, timeText+date만, timeText다른값 → 거절.7시단독은 오늘19시·과거시 INVALID_TIME |
| 신규15·SDK | tools/list에서 date/startTime 발견, tools/call에서 다음날19:00 성공·반환구간 정확. legacy도 성공. 위조 nowMs/actorId/approved/projectRoot와 혼용 호출 거절 |
| AC-04-3·18-10 회귀 | 검색 반환구간으로 hold → 같은 시작/종료 저장, 생성+10분. 겹치는 검색 후보 제외·직접hold거절, 연속구간 허용, 날짜가 다른 같은시각은 겹치지 않음 |

신규 테스트는 작성 후 사용자에게 파일·입력·기대값을 제시하고 명시 확인 전 실행하지 않는다. 기존 T-58 테스트는 이후 회귀로 실행할 수 있으나 실제 승인 폴더·토스 호출 없이 격리 HTTP 경로만 검증한다.

## 작업 순서와 완료 조건

1. [x] 부모가 C-13 사용자 답변을 수신했다. 계획 담당이 PRD·AC·tasks와 이 문서를 함께 갱신했다.
2. [x] 테스트 담당이 확정 AC별 신규3파일을 작성했고 부모가 파일을 읽어 확인했다. 기존 테스트 파일·기대값은 수정하지 않았다.
   - [x] 사용자가 “74개 테스트 확인, 다음 단계 진행”이라고 명시 확인했다. 기준 커밋은 `23c7e363715f46f660877ab175f13a4a6eefe61a`이다.
3. [x] 직접rules39개·service13개의 기능 Red와 Stop 전체54FAIL/250PASS를 확인했다. 직접stdio는 interrupt되어 완료 결과 미확인이다. 당시 읽기 guard 차단만 사용자에게 질문하여 중단했고, 사용자 “계속해 줘” 수신 후 직접 Red 이력을 받아 같은rules/service사례3회 집계를 확인·알렸다. 재개 지시를 적용해 Red 반복 없이 구현 담당에게 인계했다. [실행·중단 기록](mcp-datetime-validation.md)을 따른다.
4. [x] 구현 담당이 `src/rules/mcp-booking.ts`, `src/rules/index.ts`, `src/mcp/booking-service.ts`, `src/mcp/server.ts` 네 파일에 신규 순수 함수·schema·service·도구 설명을 연결했다.
5. [x] 구현 담당 신규74개·전체304개 Green, 부모 독립15파일304/304 PASS, 타입·diff 정적검사 exit0/PASS. 부모의 단독 `git diff HEAD -- tests` exit0·빈diff로 테스트 불변을 확인했다. 실행 근거는 [검증 기록](mcp-datetime-validation.md)을 따른다.
6. [x] GPT-6-Astra 읽기 리뷰가 문서·테스트·소스·부모 검증 증거를 대조했다. 명세 준수·코드 품질의 확인된 수정 필요 지적0건이며 테스트 재실행은 하지 않았다.
7. [ ] 부모가 AC별 결과와 설정 재접속 필요성 등 실사용 제한을 보고한다. 실제 Codex 도구 재연결을 수행한 경우에만 새 도구 필드 사용 확인으로 기록한다.

완료는 새 날짜/시각 경로의 승인·Red·Green·리뷰와 기존7시 계약·시간/자격/점유 회귀를 확인한 상태이다. 도구 확장이 실제 충전소 예약, 인간 승인 파일 생성, 테스트 결제 완료를 뜻하지 않는다.

## Review Focus

- SDK가 신규필드를 tools/list에 노출하고 실제 tools/call에서 수용하는지 신규stdio 테스트로 검증한다.
- 자동 날짜 보정과 UTC전날/서울당일 변환은 신규규칙 테스트로 검증한다.
- partial/mixed 입력이 legacy기본값으로 조용히 수용되지 않는지 신규service 테스트로 검증한다.
- 7일 마지막 시작의 종료가 제한 밖이어도 허용되는지 AC-04-1 규칙/service 테스트로 검증한다.
- 검색 결과를 hold에 전달해 다른날짜로 바뀌거나 만료가 연장되지 않는지 신규service 연결 테스트로 검증한다.

## 이번 계획 작업 상태

- 필수 문서·소스·선행 검증 기록: 읽기 확인 완료.
- C-13 이번 명시 입력/호환 계약: 사용자 “이 계약으로 진행” 수신·관련 문서 반영 완료. 나머지 자연어 정책은 미정 유지하며 T-59가 의존하지 않는다.
- 신규 테스트 작성 완료: `tests/rules/mcp-datetime.test.ts`39개, `tests/mcp/datetime-service.test.ts`30개,
  `tests/mcp/datetime-stdio.test.ts`5개, 총74개. 개수는 소스 기반이며 테스트 실행·수집 결과가 아니다.
- 정적 검사: 테스트 담당의 `npm run typecheck` exit0/PASS, `git diff --check` PASS 전달 근거.
  정적 통과를 AC 기능 PASS나 구현 착수의 Red 증거로 간주하지 않는다.
- 사용자 테스트 명시 확인·rules/service 기능 Red 수신 완료. Stop 신규stdio2개도 FAIL이며 직접stdio 완료 결과는 NOT_RUN/미확인.
- 읽기 차단 질문·중단 후 사용자 재개 지시를 받았다. 이후 직접 Red 이력으로 같은rules/service사례3회 집계를 확인·알리고 재개 지시를 적용해 구현 담당에게 인계했다.
  실패 횟수는 보존하며 차기 같은 사례 실패 시 즉시 중단한다. 자세한 근거는 [검증 진행 기록](mcp-datetime-validation.md).
- 구현·Green 완료: 신규74개·전체304개 PASS, 부모 독립 재검증304/304·정적검사·테스트불변 PASS.
- GPT-6-Astra 읽기 리뷰 PASS·확인된 수정 필요 지적0건. T-59 서버코드·순수규칙·격리서비스/SDK 범위 완료.
- 여러 호스트 시간대 실행, 실제 Codex 재접속/schema캐시갱신·프로젝트hold생성·인간 승인·토스 연결: NOT_RUN.
- 현재 세션 도구 metadata는 기존7시 schema로 읽기 확인됐다. 신규서버 등록의 격리 SDK PASS와 구분한다.
- 계획 확정 자체와 기능검증을 구분하며 위 완료는 [검증 기록](mcp-datetime-validation.md)의 실행·리뷰 범위에 한정한다.
