# 실제 로컬 MCP 서버·터미널 승인 계획

최신 관문: 사용자가 테스트62개를 명시 확인하고 스위치를 끈 뒤 `c047d35`로 커밋했다. 직접Red(08:55:34)는 신규28개 FAIL·기존190개 PASS였다. 구현과P1성능수정 후 전체218/218·타입·정적검사PASS, 승인테스트빈diff를확인했고 GPT-6-Astra최종재리뷰PASS(잔여P0~P3없음,1/2회사용)이다. 아래 작성단계의 확인대기 기록은 과거시점이며 최종증거·실행예제·NOT_RUN한계는 [mcp-server-validation.md](mcp-server-validation.md)에 기록한다.

작성일: 2026-10-12. 서버구성·검색·점유기한·결제없는주소 범위의 사용자 답변을 PRD·AC·작업 목록에 반영했다. requestId멱등과 만료approve거절도 최종 사용자답변을 받았다. 테스트 작성 → 사용자 명시 확인 → 실제 기능 실패 → 구현 → GPT-6-Astra 읽기 리뷰 순서를 유지한다.

## 선행 증거와 범위

- 현재 HEAD `32f6439`(MCP 예약 규칙 구현과 리뷰). 시작 상태는 사용자 소유 `.codex/TEST_WRITING`, `artifacts/`만 untracked였다. 공유 변경을 되돌리지 않는다.
- [mcp-booking-validation.md](mcp-booking-validation.md): 공개 순수 함수5개·승인 테스트34개 PASS, 부모 전체190개 PASS, 타입 PASS, GPT-6-Astra 지적 없음. 실제 MCP 등록·승인 명령·파일 I/O·결제URL은 미검증이다.
- 기존 `src/rules/mcp-booking.ts`의 시간·후보·10분·승인파일snapshot·링크기간 판정을 재사용한다. `getMcpHoldTiming`은 실제 점유 생성이 아니며 `evaluateMcpPaymentLinkRequest`는 파일 읽기·링크 발급이 아니다.
- 사용자 요청은 실제 로컬MCP의 세 도구, 실제 `npm run approve -- <holdId>` CLI, 승인파일을 서버에서 읽는 경로, 결제 없는 주소 생성이다. **결제 페이지는 나중**이므로 HTTP페이지·토스결제·실제URL사용차단은 이번범위가 아니다. 점유만료시 새링크생성거절과 주소기한만 검증한다. 이번 서버 요청을 기존 순수 규칙 PASS로 대신하지 않는다.
- 필수 AGENTS·PRD·AC·tasks·constitution·agents와 현재 검증 문서를 읽었다. guard를 단독cat으로 읽어 `.codex/approvals`가 사람 전용 보호영역임을 확인했다. 실제 승인폴더 읽기/쓰기·approve 실행·가드수정은 하지 않았다.

## 확정 답변과 남은 정책 질문

| ID | 최종 합의와 내부 선택 | 영향 |
|---|---|---|
| C-12 | **확정:** 정확히1km 포함, 거리순, 동률 statId/chgerId | 기존규칙의 1000m오류제거·정렬과 관련테스트를 별도갱신하고 사용자재확인 |
| C-14 | **확정:** hold생성부터10분, approve/링크/같은반복으로연장없음 | 같은키기존hold반환/다른키겹침거절, 만료approve오류·파일미생성 확정 |
| C-15 구성 | **확정:** 공식SDK stdio, Node24TS, 로컬JSON, 신뢰된환경의 test-driver-1 | 단일시연범위. 직렬mutation+atomicwrite는 기술선택, 여러서버동시구동은 이번범위아님 |
| C-15 승인 | **확정:** `.codex/approvals/<holdId>.json`, CLI-only. 정규파일/no-symlink·대상hold검증 | 실제폴더에 agent쓰기없음. 만료approve오류·파일미생성 확정 |
| C-15 링크 | **확정:** 결제없는주소만, 페이지는후속 | 실제HTTP페이지·토스·URL사용차단은 NOT_RUN |
| C-05·13 | **이번범위 확정:** 강남역1km·정확24시간이용가능·서울오늘19시예문 | 다른운영시간문구·자연어추측금지 |

같은requestId는원래hold반환/기한유지, 다른requestId의겹치는유효점유는거절한다. `.codex/approvals` 파일을 에이전트가 실제로 생성하거나 approve를 대신 실행해서 인간 승인으로 삼지 않는다.

## 공개 계약 — 확정 부분 테스트 인계

부모의 읽기 전용 공식 SDK 조사: npm registry의 `@modelcontextprotocol/server`와 `@modelcontextprotocol/client` 2.3.1, Node>=20, zod^4.2/core2.3.1 확인. 합의 버전은 v2.3.1이며 v1 `@modelcontextprotocol/sdk` 깊은경로를 혼용하지 않는다. server는 `McpServer`를 `@modelcontextprotocol/server`, `serveStdio`를 `@modelcontextprotocol/server/stdio`에서 사용한다. client는 `Client`를 `@modelcontextprotocol/client`, `StdioClientTransport`를 `@modelcontextprotocol/client/stdio`에서 사용한다. 도구schema는 zod/v4의 전체object이다. [공식 v2.3.1 문서](https://github.com/modelcontextprotocol/typescript-sdk/blob/v2.3.1/docs/index.md), [공식 첫 서버 안내](https://ts.sdk.modelcontextprotocol.io/v2/get-started/first-server). 조사 시점에는 미설치였으며 이후 사용자 기술 합의 후 부모가 아래 환경준비 절의 버전으로 설치했다. 기능 실행은 아직 하지 않았다.

MCP 도구명은 `search_chargers`, `hold_charger`, `request_payment_link`를 제안한다. 외부 도구 인수에는 approval boolean·승인파일경로·현재시계·저장root가 없으며 신뢰된 서버 설정에서 제공한다. SDK 실제 JSON-RPC `initialize`/`tools/list`/`tools/call`로 연결·스키마·세 도구 등록을 검증한다. stdout은 프로토콜 전용이며 진단은stderr로 보낸다.

| 공개 경계 제안 | 입력/출력 | 테스트 관문 |
|---|---|---|
| `createMcpBookingService(options)` | options는 projectRoot/sourceDataDir/now()/trusted actor. service의 search/hold/requestPaymentLink 메서드 제공 | fixture root만; 현재 규칙함수 재사용·잘못된외부입력거절 |
| service.search | 장소·커넥터·시작·길이 → 후보식별자·거리·자격·수집/상태시각 | 원본fixture병합, C12합의경계·정렬, 제한/삭제/타입/24h/상태·현재~7일 |
| service.hold | 충전기·구간·requestId → holdId·원래구간·생성/만료·미확정 | 같은충전기겹침동시2건중1개·연속구간·파일원자저장·정책합의멱등 |
| service.requestPaymentLink | holdId → 승인전 summary/approvalCommand; 파일+점유유효면 결제없는주소/expiresAtMs | 모델인수승인거절·실제adapter파일읽기·없음/다른hold/만료·주소기한 |
| `approveHold(holdId, options)` 및 CLI entry | CLI사용자가 holdId 전달 → 승인파일 생성 또는 오류/exitCode | 전혀다른 isolated fixture root에서 명령진입점·인수·hold검증·파일생성만검증 |
| `src/mcp/server.ts` entry | stdio subprocess → SDK Client 실제 tools/list/call | 외부 Codex 설정없이 테스트 subprocess; stdout 로그오염없음/정상종료 |

SDK의존성은 부모가 사용자기술합의 후 테스트환경준비로 설치했다: server/client2.3.1, zod4.6.6, tsx4.23.15. 기존rules의 `.js`import를 유지하기 위해 실행은 `node --import tsx src/mcp/server.ts`, CLI는 `node --import tsx src/cli/approve.ts`이다. `mcp:booking`, `approve` package script 연결은 부모소유다. Codex예제는 npm배너의stdout오염을 피하려 node직접실행 또는 `npm --silent run mcp:booking`이다.

최종 service는 `src/mcp/booking-service.ts`의 `createMcpBookingService({projectRoot,sourceDataDir,now:()=>number,actorId,linkBaseUrl})`이다. sourceDataDir는 stations/status 원본JSON디렉토리(기본 ../ev-map/data)이며 상태저장디렉토리가 아니다. 메서드는 모두async이다.

- searchChargers: `{location:'강남역',connector:ConnectorKind,timeText:'7시',durationMinutes:30|60|90}` → `{range:TimeRange,candidates:readonly Candidate[]}`. Candidate는 기존 McpChargerCandidate에 저장사양(statNm/addr/statUpdDt 등)을 보존한다. 거리순/IDtie·반경포함·운영시간정확문구·최신상태병합·기존자격/겹침을 적용한다.
- holdCharger: `{statId,chgerId,connector:ConnectorKind,startMs,durationMinutes,requestId}` → `{holdId,charger,range,createdAtMs,expiresAtMs,status:'held'}`. connector는 필수이며 저장hold와 requestId payload에 보존한다. 검색을 거치지 않은 직접hold도 선택커넥터 지원·기존자격·시간·겹침을 재검사한다. 동일requestId+동일payload는만료후에도원래hold반환/불연장, 다른payload(다른connector포함)는IDEMPOTENCY_CONFLICT, 다른requestId겹침은HOLD_CONFLICT이다. 만료후새requestId는기존자격·시간조건충족시에만신규hold가능하다. 이는 요청의 명시선택 전달 계약이며 계정선택 저장/변경(C-11)은 확정하지 않는다.
- requestPaymentLink: `{holdId}` → 기존McpPaymentLinkDecision 필드와 `{linkUrl:string|null,expiresAtMs:number}`. 미승인null·요약/명령·effect0, 승인파일해당hold+유효일 때 `${linkBaseUrl}/payment/<holdId>`의 주소와 원래hold기한이다. 주소는 결제없고 실제HTTP서버가 없다. 만료기한연장·새예약확정·토스호출없음.
- CLI 공개진입점: `src/cli/approve.ts`의 `approveHold(holdId,{projectRoot,now:()=>number})` → Promise<{holdId,approvalPath}>. 직접entry실행을 제외한import는 CLI를 실행하지 않는다. 임시fixture root에서만 실제파일쓰기 검증한다.
- 서버신뢰환경: `EV_BOOKING_ROOT`, `EV_BOOKING_SOURCE_DATA_DIR`, `EV_BOOKING_ACTOR_ID`, `EV_BOOKING_LINK_BASE_URL`; 시험시계fixture의 `EV_BOOKING_NOW_MS`는 서버설정주입이며 모델인수아니다. localstate는기존ignore된 `.local/mcp-booking/state.json`이며 사용자artifacts와 분리한다. 승인파일JSON내용 `{holdId,approvedAtMs}`이다. 정규파일/no-symlink·내용대상불일치는 승인으로수용하지 않는다. 서비스는 저장된hold의 소유자와 신뢰된 actorId를 비교하며 모델이 사용자/금액을 바꾸지 못한다.
- root/user/now/approvalPath/approved는 tool입력schema에 없으며 추가필드는 거절한다. fixture제어용옵션은 함수테스트와trustedenv경계에만 있다.

이 반환형과 파일규약은 내부기술계약이다. 구체오류코드와파일규약은아래최종계약을따른다. 실제 `.codex/approvals` 경로를 접근하거나 approve를 실행하지 않는다.

## 파일 소유권과 테스트 안전 경계

- 계획 담당: 이 문서 및 요청받은 PRD·AC·tasks만 수정한다.
- 테스트 담당: `tests/**`만. 기존34개는 기본적으로 불변. 정확1km같은 정책 변경은 사용자 별도 테스트 변경 승인과 재확인 대상이다.
- 구현 담당: `src/rules`, `src/mcp`, `src/cli`, `src` 아래 저장adapter만. 정책판정 중복금지. HTTP페이지구현은 이번범위가 아니다.
- 부모: package.json/package-lock.json의 SDK·scripts(`mcp:booking`, `approve`)·필요한 검사범위 설정만. **SDK/client·tsx 테스트환경준비는 기술합의 후 Red 전에 허용**되어 설치완료. 제품소스구현은 사용자확인과Red 뒤. 훅/TEST_WRITING/보호폴더/Codex전역설정은 변경하지 않는다.
- 리뷰 담당: 읽기만, 승인테스트불변·원본·MCP프로토콜·신뢰context·금액/기한/동시성을 대조한다.
- 테스트의 승인fixture는 전용임시root이며 실제project root를 지정하지 않는다. 테스트 실행이 실제 `.codex/approvals`를 쓰지 않도록 소스의production경로와 명시적으로 격리한다. 테스트 파일이 만든승인fixture는 실제 인간 승인 증거가 아니며 승인 가드를 대신하지 않는다. 이 검증전략은 사용자합의가 선행한다.
- Codex 설정예제는 문서로 제공하고 사용자 전역설정을 자동수정하지 않는다. 실제 Codex호출·실제승인파일 생성은 사용자가 수행하는 시연범위와 분리해 보고한다.

## 상태

기존 순수 규칙: 과거범위 PASS. 서버합의·계획·SDK환경준비: 수행. 필요한서버정책답변: 최종수신. 새 서버테스트·프로토콜·CLI·Codex실연결: NOT_RUN. HTTP페이지·토스는 이번범위밖이며 NOT_RUN. 미정정책기대값을 만들거나 소스를 구현하지 않았다.

테스트 작성 완료 근거: 테스트 담당의 최종 파일·계약 대조 보고. `tests/rules/mcp-booking.test.ts`는 기존34개 기대값을 유지하고 반경1000m 포함/거리·ID정렬2개를 추가해36개이다. 신규 `tests/mcp/booking-service.test.ts`24개와 `tests/mcp/stdio.test.ts`2개, 공용 `tests/mcp/fixtures.ts`가 있다. 직접hold 커넥터불일치 거절1개를 추가해 이번 신규 사례28개, MCP관련총62개, 전체218개이다. 사용자 테스트 명시 확인은 아직 대기이다. 실제 승인 폴더 접근은 없다.

에이전트 직접 기능테스트 실행·수집은 `NOT_RUN`이다. 부모가 전달한 Stop 훅 08:49:06의 실제 실행은 신규28개 `FAIL`/기존190개 `PASS`/전체218개이며 타입검사는 `FAIL`(stdio.test.ts47의 TS2339)이었다. 이 훅 결과를 직접 실행이나 사용자 테스트 확인으로 대신하지 않는다. 사용자는 이후 문서 파일편집과 타입오류 수정만 명시 승인했으며 기능테스트 기대값·구현·실제 승인폴더 변경은 승인하지 않았다.

타입오류 수정 후 테스트 담당이 `npm run typecheck`를 실행하여 exit0/`PASS`를 확인했고 부모가 결과를 확인했다. 수정은 stdio47의 structuredContent 타입 `Record<string,unknown>|undefined`를 좁히는 부분만이며 기존 문자열assertion과typeof guard·기대값은 유지했다. 기능테스트 실행·수집은 하지 않았다. 현재62개 관련테스트는 사용자 명시확인 대기이며 제품소스는 구현하지 않았다.

추가 오류 사례는 잘못된 CLI식별자의INVALID_ARGUMENTS, 다른actor의FORBIDDEN, 손상state의STORAGE_ERROR와원문보존, source손상의SOURCE_DATA_ERROR이다. 같은root의서비스2개 동시확보와 승인파일파손/symlink 불신을 검증한다. 테스트 파일을 부모가 사용자에게 제시하고 명시 확인을 받은 뒤에만 실행한다.


## 최종 테스트 인계의 기술 계약

- stations/status JSON은원본처럼배열이다. 강남역시연기준점은lat37.497942/lng127.027621이며 실제현장좌표보장아니다. haversine meter계산,1000이하, 거리숫자순·ID문자열순이다. 숫자exact1000순수테스트와좌표부동소수경계를분리한다.
- state JSON은{version:1,holds:[{holdId,requestId,actorId,charger,connector,range,createdAtMs,expiresAtMs,status:'held'}]}이다. connector는 해당 요청의 선택값이며 계정별저장정책이 아니다. 같은root의서비스인스턴스mutation을직렬화하고read/check/atomicwrite를한단위로한다. 단일stdio프로세스운영범위이며다중프로세스락완료를주장하지않는다.
- 서비스Error.code: INVALID_ARGUMENTS, UNKNOWN_CHARGER, INELIGIBLE_CHARGER, INVALID_TIME, HOLD_CONFLICT, IDEMPOTENCY_CONFLICT, UNKNOWN_HOLD, HOLD_EXPIRED, FORBIDDEN, STORAGE_ERROR, SOURCE_DATA_ERROR. source/state파손을조용히성공/빈저장으로바꾸지않는다.
- approval없음/잘못JSON/다른hold/symlink는신뢰승인없음으로판정하여기존decision+linkUrlnull이다. 만료approve는HOLD_EXPIRED/no새파일이다. 기존유효파일CLI반복은기존파일/hold기한을유지한다.
- MCP성공structuredContent는service반환object,content는text JSON이다. 실패isError:true/code표시,stdout프로토콜전용이다. 모델인수root/user/now/approval/추가필드는schema거절이다.
- CLI성공stdout은JSON{holdId,approvalPath}+newline/exit0,실패stderr code/exit1/no새파일이다. approveHold의임시root실제I/O와subprocess node --import tsx src/cli/approve.ts를검증한다. npm --silent run approve -- fixturehold도격리envroot로검증하며실제repo승인폴더쓰기는금지한다.
- 부모가SDK/tsx설치와package명령·Vitest rules/mcp수집·tsconfig검사범위를테스트환경으로준비했다. 새테스트는tests/mcp에두고기존34개에서1000포함/정렬관련사례를별도추가한다. 아직사용자테스트확인전이므로기능실행하지않는다.
- Codex설정예제는 [mcp_servers.ev_booking],command=node,args=[--import,tsx,src/mcp/server.ts],cwd=절대project경로와신뢰env이다. npm을쓴다면 --silent이다. 부모가공식문서와installed codex mcp add --help로형식을읽기확인했으며사용자전역설정은수정하지않았다.

직접hold의 chgerType01(DC차데모)에 DC콤보를 선택하면 INELIGIBLE_CHARGER이고 점유를 저장하지 않는다(AC-02-6·7·8). 검색에서 허용된 후보였다는 사실로 이 검사를 생략하지 않는다.
