# 로컬 MCP 서버·승인 CLI 검증 기록

승인 기준 커밋: `c047d35`. 범위: [서버 계획](mcp-server-plan.md)의 T-54~57 한정 구현과 사용자 확인 테스트62개이다.

## 사용자 확인과 구현 전 실패

- 사용자가 새 테스트62개를 명시 확인하고 테스트 스위치를 끈 뒤 커밋했다. 부모 확인 시 HEAD는 `c047d35`, 사용자 `artifacts/`만 untracked였다.
- 관련 테스트는 규칙36개·서비스24개·stdio2개이다. 구현 중 승인 테스트를 바꾸지 않고 기준 커밋과의 diff로 불변을 확인한다.
- 테스트 담당 직접 Red: `08:55:34`, `npm run test:rules`, exit1. 전체218개 중 신규28개 FAIL·기존190개 PASS, 파일3개 FAIL·8개 PASS였다.
- 규칙2개는 정확1000m의 기존RangeError와 정렬 불일치, 서비스24개는 `src/mcp/booking-service.ts` 등 제품 entry 누락, stdio2개는 `src/mcp/server.ts` 누락 assertion으로 실패했다. SDK·환경 오류가 아니라 제품 미구현/정책 불일치의 실패 증거이다.
- 실행 전후 `git diff -- tests`는 빈 diff였다(부모·테스트 담당 전달 근거). 앞선 타입 수정 후 직접 `npm run typecheck` exit0/PASS는 테스트 환경 검사이며 새 제품 Green을 뜻하지 않는다.
- 부모가 실패 증거를 구현 담당에게 인계했다. 구현 전 Red 실패는 사용자의 집계 지시에 따라 구현 후 연속실패 횟수에 넣지 않는다.

| 검사 | 결과 | 해석 |
|---|---|---|
| 사용자 테스트 명시 확인 | 확인 수신 | 사용자 관문 통과 |
| Red 실행 전후 테스트 불변 | PASS | 빈 diff 근거 |
| 신규 서버 Red | FAIL | 정상 구현 전 기능 실패 증거 |
| 구현 후 Green·전체 테스트·타입 | PASS | 아래 구현 담당·부모의 독립 실행 근거 |
| GPT-6-Astra 읽기 리뷰 | PASS | P1 수정 후 재리뷰 완료, 잔여P0~P3없음 |
| 실제 Codex 등록·인간 승인 | NOT_RUN | 예제와 실제 시연 구분 |
| HTTP 결제 페이지·토스 연결 | NOT_RUN | 이번 범위 밖 |

## 구현 후 Green과 부분 AC 결과

- 구현 담당 `09:01:27`, `npm run test:rules`: exit0, 11파일218/218 PASS. 첫 구현 후 기능 실패는0회였다.
- 부모 독립 재검증 `09:02:16`, `npm run test:rules`: exit0, 11파일218/218 PASS. `npm run typecheck`, `git diff --check`도 exit0/PASS였다.
- 부모 `git diff c047d35 -- tests`는 빈 diff였다. 사용자 확인된 테스트의 기대값과 파일은 구현 중 변경하지 않았다.
- 구현 소스는 `src/rules/mcp-booking.ts`, 신규 `src/rules/mcp-service.ts`, `src/mcp/{storage,booking-service,environment,server}.ts`, `src/cli/approve.ts`이다. 정책 판정은 순수rules를 재사용하고 원본 데이터·가드·스위치·실제승인파일은 변경하지 않았다.
- 파일I/O·CLI·SDKstdio는 격리 fixture root의 실제 처리 테스트 PASS이다. 실제 Codex 등록이나 실제 프로젝트의 인간 승인 실행을 대신하지 않는다.
- GPT-6-Astra 읽기 리뷰는 조회가드에 실제 차단되어 한때 BLOCKED였다. 사용자가 guard 관련 조회 재개와 P1 수정 진행을 명시 승인한 뒤 cat으로 재개했다. 초기 전체리뷰는 완료됐고 추가지적은 없었다.
- 남은 P1 한 건: 충전소75,891개×상태변경1,454개의 반복timestamp 파싱으로 병합이79,848ms 걸려 기본MCP요청기한60,000ms를 넘는다. AC-18-4·8/T-54·57의 실제 원본조회 응답에 영향을 준다. fixture Green으로 원본 성능을 검증했다고 볼 수 없다.
- P1 수정1/2회 완료: 반복파싱을 제거하고 상태변경을 인덱스로 조회하는 선형 병합으로 바꿨다. 구현 담당의 실제 원본 읽기 전용 측정은 station75,891+status1,454 → 결과75,891, 13.726ms였다(이전79,848ms). 기존 최신상태 병합 의미를 유지하며 원본파일을 수정하지 않았다.
- 부모 수정 후 재검증 `09:08:21`: 전체218/218 PASS, `npm run typecheck`·`git diff --check` PASS, 승인기준의 tests diff는 빈 diff였다. 실제원본순수병합 측정과 fixture기능테스트 통과를 각각의 근거로 구분한다.
- GPT-6-Astra 최종 재리뷰 PASS: P1이 해결됐고 잔여P0~P3 지적이 없다. P1 수정·재리뷰는1/2회 사용했다.
- 리뷰어의 독립 읽기 전용 동일원본 측정: station75,891+status1,454 → 결과75,891, 10.638416ms/exit0(이전79,848.014666ms). 리뷰어가 `git diff c047d35 -- tests`의 빈 diff도 재확인했다. 전체218/218·타입·정적검사 PASS 근거와 함께 이번 한정범위 완료를 확인했다.

| 관련 기준 | 실행 결과·범위 | 상태 |
|---|---|---|
| AC-18-4, AC-02-6·7·8 | 1000m포함·거리/ID정렬, sourcefixture검색·자격·직접hold커넥터 거절 | PASS(해당 규칙·fixture부분) |
| AC-18-8 | SDK Client의 실제stdio initialize/tools/list/tools/call·세도구·잘못된인수거절 | PASS(로컬시험프로세스) |
| AC-18-9, AC-18-2·7 | fixture CLI·승인파일읽기·요약명령·파일불신·만료approve파일미생성 | PASS(임시root만) |
| AC-18-10, AC-04-3·4, AC-05-3 | JSON저장·같은root동시확보·requestId멱등/키충돌·원래10분기한유지 | PASS(단일프로세스시험범위) |
| AC-18-11 | 승인후결제없는주소·원래기한·미승인/만료생성거절 | PASS(주소생성만) |
| AC-18-12 | 문서 설정예제 제공 | 제공완료; 실제Codex등록 NOT_RUN |

## 로컬 실행과 Codex 설정 예제

아래는 사용자가 구현 완료 후 실행할 예제이다. 에이전트는 전역 설정 수정·실제 승인 파일 생성·approve 실행을 하지 않는다.

```sh
npm --silent run mcp:booking
```

stdio 프로세스는 MCP 클라이언트가 관리한다. Node.js24와 프로젝트의 tsx를 사용하고 stdout은 프로토콜 전용, 로그는 stderr이다.

```toml
[mcp_servers.ev_booking]
command = "node"
args = ["--import", "tsx", "src/mcp/server.ts"]
cwd = "/Users/dante/Documents/Codex/2026-10-12/reshoot/ev-booking"

[mcp_servers.ev_booking.env]
EV_BOOKING_ROOT = "/Users/dante/Documents/Codex/2026-10-12/reshoot/ev-booking"
EV_BOOKING_SOURCE_DATA_DIR = "/Users/dante/Documents/Codex/2026-10-12/reshoot/ev-map/data"
EV_BOOKING_ACTOR_ID = "test-driver-1"
EV_BOOKING_LINK_BASE_URL = "http://127.0.0.1:5180"
```

주소는 결제 없는 문자열이며 HTTP 페이지가 열린다는 뜻이 아니다. 시험용 고정 시계는 사용자 예제에 넣지 않는다. 설정을 복사하는 것은 사용자의 선택이며 자동 등록은 하지 않는다. [Codex 공식 stdio 설정 안내](https://learn.chatgpt.com/docs/extend/mcp#stdio-servers)를 참고한다.

## 사람이 수행하는 승인 흐름

1. Codex에서 `search_chargers`로 후보를 조회한다.
2. `hold_charger`에 선택connector·후보식별자·구간·requestId를 전달한다.
3. `request_payment_link`의 요약과 승인 명령을 확인한다. 승인 전 링크는 없다.
4. 사용자가 프로젝트 터미널에서 반환된 `npm run approve -- <holdId>` 명령을 실행한다.
5. 유효 점유 동안 다시 링크를 요청하면 서버가 해당 승인 파일을 읽어 주소·기한을 반환한다.

실제 승인 경로는 `.codex/approvals/<holdId>.json`, 상태 경로는 `.local/mcp-booking/state.json`이다. 테스트 임시root의 승인 파일은 실제 인간 승인을 대신하지 않는다.

## 완료 범위의 제한

강남역1km·서울오늘19시·명시선택커넥터·독립10분 점유 흐름이다. 같은requestId는 원래hold·기한 유지, 다른requestId 겹침은 거절, 만료approve는 새파일 없이 오류이다. 테스트 예약금3000원/KRW를 안내하지만 주소 생성으로 결제·예약 확정은 발생하지 않는다.

전체 로그인·운영자·대기·복구·다중프로세스락·다른 자연어/운영시간 문구는 완료 범위 밖이다. 최종 AC별 부분 결과는 위 표의 실행범위에 한정한다.

## 최종 결론

T-54~57의 합의된 한정범위는 사용자 테스트 확인→실제Red→구현·Green→P1수정→GPT-6-Astra재리뷰 절차를 완료했다. AC-18-4·8·9·10·11과 관련AC-02·04·05의 위 표에 명시된 규칙·격리fixture·SDKstdio 부분은 PASS이다. AC-18-12의 등록예제는 제공했으며 실제Codex등록은 NOT_RUN이다.

다중stdio프로세스락, HTTP결제페이지·토스연결, 실제Codex등록/호출, 실제프로젝트에서 사람이실행하는approve는 NOT_RUN이다. 임시root의CLI/승인파일테스트와실제인간승인을혼동하지않는다. 원본·가드·스위치·실제승인파일·사용자전역설정은에이전트가변경하지않았다.
