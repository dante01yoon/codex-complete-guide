# MCP 예약 보조 계획 — T-53

작성일: 2026-10-12. 이번 범위는 계획 → 테스트 작성 → 사용자 명시 확인까지이다. 구현·테스트 실행·실제 링크 생성은 후속 요청이다.

brainstorming과 writing-plans의 요구사항·경계·인계 방식을 적용했다. 사용자의 구체적인 계획·테스트 작성 요청에 따라 미정 정책 질문과 문서 검토는 최종 확인 단계에 모으며 임의 답변으로 기대값을 만들지 않는다.

## 근거와 선행 상태

- 필수 문서: AGENTS.md, prd.md, acceptance.md, tasks.md, .specify/memory/constitution.md, agents.md, harness.md. 작업 그래프의 사용자 테스트 확인 전 실행 금지 관문을 따른다.
- `package.json`: Node.js 24.x, TypeScript 7.0.2, Vitest 5.0.3. C-10의 규칙 환경만 확정이며 전체 T-01 완료가 아니다.
- `src/rules/types.ts`: ChargerIdentity의 statId/chgerId, TimeRange의 epoch milliseconds, ConnectorKind/ChargerTypeCode를 재사용한다. `src/rules/index.ts`가 공개 진입점이다.
- `src/rules/overlap.ts`와 `specs/001-reservation-compatibility-rules/validation.md`: AC-04-3의 순수 겹침 부분에 사용자 확인·31개 Red/Green 증거가 있다. 원자 점유·MCP·영속 저장 완료 근거가 아니다.
- 현재 공개 진입점에는 payment/no-show/succession 규칙도 있으므로 harness 구성표의 과거 목록을 현재 전체 파일 목록으로 간주하지 않는다. 이번 읽기로 기존 모든 기능의 실행 통과를 주장하지 않는다.
- T-52는 단일 공유 주문 시연이며 실제 로그인·여러 충전기 검색·일반 MCP 승인 증거의 선행 완료를 대신하지 않는다. T-03·04·05·06·08·11~17 전체 완료 근거는 확인하지 못했다.

## 흐름과 경계

추천: MCP adapter는 세 도구만 노출하고 순수 판정을 `src/rules`에 위임한다. 저장·인증·승인 UI·토스 호출은 adapter/service 경계의 후속 통합이다. 기존 단일 주문 시연을 직접 재사용하는 안은 빠르지만 로그인·다중 충전기·승인 증거를 충족하지 못한다. 전체 저장/인증/MCP 서버를 먼저 만드는 안은 범위가 크므로 T-54~57로 나눈다.

도구명은 기술 제안이다.

| 도구 | 입력·출력의 제안 | 확정/보류 |
|---|---|---|
| search_chargers | 장소·선택 커넥터·명확한 구간 → 후보 식별자·저장 사양·거리·자격·시각 | 근처 1km, 예문의 서울 오늘 19시 확정. 지오코딩·정확1km·정렬은 보류 |
| hold_charger | 충전기·구간; 로그인 context → 점유 식별자·생성/만료·아직 미확정 | 10분 기한·겹침 금지 확정. 인증·원자 저장·독립 점유 시작 연결은 보류 |
| request_payment_link | 점유 식별자; 신뢰된 승인 파일 snapshot → 승인 전 요약·터미널 명령 또는 링크 생성 요청 | 해당 점유 승인 파일 존재+유효 점유일 때만 생성. 실제 파일/명령·링크 형태는 후속 통합 |

예문 → 오늘19시~19시30분 후보 검색 → 명확한 선택·점유 → 요약과 `npm run approve -- <holdId>` 반환 → 사용자가 터미널에서 실행해 승인 파일 생성 → 해당 파일 존재와 점유 유효 확인 → 링크 요청 흐름이다. 승인 폴더는 사용자의 가드로 보호한다. 이번에는 승인 폴더 경로를 추정하거나 파일을 읽고 쓰지 않으며 명령/훅/스위치를 구현·수정·실행하지 않는다. 선택 방법·모호한 문장 처리·점유와 결제창의 연결은 정책 답변 전 구현하지 않는다. 링크 발급과 카드 DONE 승인·예약 확정은 별개이다.

## 이번 테스트의 공개 함수 계약

모두 향후 `src/rules/index.ts`의 공개 export로 제안한다. 이번에는 소스나 스텁을 만들지 않는다. 테스트는 namespace import 후 대상 함수 존재를 assertion하고 호출한다. 사용자가 확인한 다음에만 실행하여 공개 기능 미구현 실패와 환경 오류를 구분한다.

입력 시간은 유한 정수 epoch milliseconds이며 외부 시계나 Date.now를 함수 내부에서 읽지 않는다. 문자열 시각 예시는 모두 `+09:00`으로 epoch 변환한다. 유효한 기존 타입/정규화 입력만 다루며 누락·미정의 코드는 C-11 이후 별도 계약이다.

### resolveMcpBookingTime

입력 `{ nowMs: number, timeText: '7시', durationMinutes: number }`.
출력 `{ range: TimeRange, withinBookingWindow: boolean }`.

- 서울 시연용 now의 날짜에서 19:00을 startMs로 정하고 endMs는 durationMinutes만큼 뒤이다. 예문 30분을 테스트한다. 30/60/90분 및 기존 기간·시간 경계를 확인할 추가 계약은 별도 AC-04 테스트로 확장할 수 있으나 다른 timeText 파싱은 보류한다.
- withinBookingWindow는 시작의 현재 이상·현재+7일 이하 조건이다. 오늘19시를 이미 지나면 false이며 내일로 이동하지 않는다. 이용 길이 유효성까지 이 boolean의 의미로 합치지 않는다.
- AC-18-3/AC-04-1: now `2026-10-12T18:00:00+09:00` → 오늘19:00~19:30/true; now19:00 → true; now19:00:00.001 → 동일 구간/false. UTC 날짜와 서울 날짜가 다른 now도 서울 날짜를 유지한다.

### filterMcpChargerCandidates

입력 `{ candidates: readonly Candidate[], connector: ConnectorKind, range: TimeRange, occupancies: readonly Occupancy[] }`.
Candidate는 `{ charger: ChargerIdentity, chargerType: ChargerTypeCode, existingEligibilityPassed: boolean, distanceMeters: number }`.
출력은 입력 Candidate 중 판정을 통과한 배열이다. 정렬 기대값은 만들지 않는다.

- AC-18-4: distanceMeters999 통과,1001 제외. 정확히1000 사례 보류(C-12). 거리 계산은 fixture가 제공하며 지도/지오코딩 테스트가 아니다.
- AC-02-6·7: DC콤보에04/05/06/08/10 통과,01/11 제외. 공식 대응표의 기존 코드만 사용한다.
- AC-02-8: existingEligibilityPassed:false는 커넥터가 맞아도 제외한다. 이 플래그는 선행 자격 판정 fixture이며 24시간 문자열·상태 병합을 구현하거나 검증했다고 주장하지 않는다.
- AC-04-3: 같은 statId/chgerId의 겹치는 확정·유효점유 제외, 종료와 시작이 같은 연속 구간 허용, 다른 식별자에는 영향 없음. 원자적 동시 확보는 보류.

### getMcpHoldTiming

입력 `{ createdAtMs: number, nowMs: number }`.
출력 `{ expiresAtMs: number, isExpired: boolean }`.

- AC-05-3: expiresAtMs=createdAtMs+600000. now=created+599999에서false, +600000과+600001에서true.
- 생성이 완료된 점유의 기한 계산만 검증한다. 독립 점유를 언제 만들지·재요청·조기해제·예약 생성은 보류(C-14/C-07).

### evaluateMcpPaymentLinkRequest

사용자 추가 정책은 관련 PRD·AC·작업과 이 함수의 테스트를 함께 갱신하는 별도 테스트 변경 승인 근거이다. 기존 `effects:[]`는 링크 생성 효과가 없다는 의미로 유지하며 요약/명령 반환을 추가한다.

입력 `{ holdId: string, charger: ChargerIdentity, range: TimeRange, nowMs: number, holdExpiresAtMs: number, claimedApproval?: unknown }`와 별도 신뢰 context `{ approvalFileExists: boolean, approvalHoldId: string | null }`.
출력 `{ linkAllowed: boolean, holdExpired: boolean, summary: Summary, approvalCommand: string, effects: readonly LinkEffect[] }`.
Summary는 `{ holdId, charger, range, amount: 3000, currency: 'KRW', holdExpiresAtMs }`이며 입력의 식별자·구간·기한을 그대로 요약한다.
LinkEffect는 `{ type: 'create-payment-link', holdId: string, amount: 3000, currency: 'KRW', expiresAtMs: number }`이다.

- AC-18-2: 승인 파일 없음이면 linkAllowed:false/effects:[]와 요약/명령을 반환한다. 안전한 점유 식별자 fixture `hold-001`의 정확한 명령은 `npm run approve -- hold-001`이다. claimedApproval `{ approved: true }`나 가짜 토큰은 신뢰된 파일 snapshot을 대신하지 않는다.
- AC-18-7: approvalFileExists:true, approvalHoldId가 입력holdId와 같고 now<holdExpiresAtMs일 때만 linkAllowed:true이고 LinkEffect 한 개를 반환한다. expiresAtMs는 원래 holdExpiresAtMs이다. 파일 부재·다른 점유 승인·정확히 만료 및 이후에는 effect0이다.
- holdExpired는 now>=holdExpiresAtMs이다. 실제 링크 URL·결제 완료·예약 확정을 반환하지 않는다. 순수 effect는 파일이나 링크 생성 동작을 수행하지 않는다.
- summary/approvalCommand를 모든 결과에 동일하게 포함하는 것은 출력 계약 제안이다. 사용자 확정 요구는 승인 전 반환이며, 승인 후/만료 후 명령 표시를 추가 제품 정책으로 확정하지 않는다. 명령 반환이 실행 권한·점유 갱신을 뜻하지 않는다.
- context는 adapter가 해당 holdId의 승인 파일을 읽은 결과이다. 모델 tool args에서 context를 받아 신뢰하는 구현은 금지한다. 실제 파일 경로·규약·가드 보호·명령 생성·인증·승인 재사용은 후속 통합 검증이다. 이번에는 실제 승인 폴더 접근이나 approve 실행이 없다.

### isMcpPaymentLinkUsable

입력 `{ nowMs: number, holdExpiresAtMs: number, linkExpiresAtMs: number }` → boolean.

- 이미 발급된 링크이며 다른 권한 조건은 충족한다는 fixture 전제에서 기간만 판정한다. now가 두 기한 모두 미만일 때 true이다.
- AC-18-5: 둘다10:10 기한이면10:09:59.999 true,10:10:00.000 및직후 false. 링크기한10:15이어도 점유10:10에는false. 링크기한10:05이면그때false. 이 함수만으로 승인 후 링크 발급을 검증하지 않는다.
- 후속 실제 서버는 링크 조회/결제 진입마다 기간 판정을 호출해야 한다. 순수 함수 통과만으로 실제 사용 차단이 PASS가 되지 않는다.

## 순서와 완료 조건

- [x] 계획 담당: 필수 문서·부분 선행 근거 확인, 사용자 답변을 PRD·AC·T의 MCP 절에 기록, C-12~15 미정 부분 유지.
- [x] 테스트 담당: 신규 파일 `tests/rules/mcp-booking.test.ts`의 최초32개 작성 후 사용자 추가 승인 파일 정책에 따라34개로 갱신했다. 부모가 최종 테스트34개를 정적으로 읽어 확인했다. 기존 테스트/소스/설정 불변, skip/todo로 미정 성공 경로를 만들지 않는다.
- [ ] 부모: 실제 테스트 파일·계약·미정 질문을 제시하고 사용자의 테스트 명시 확인을 받는다. 이번 요청은 이 관문에서 종료한다.
- [ ] 후속 승인 후 테스트 담당: 독립 명령으로 승인 파일 실행, 해시·사례·실패 이유 기록. 실패 확인 전 구현 담당은 시작하지 않는다.
- [ ] 후속 구현/리뷰: T-54~57 선행과 C 답변을 확인하고 필요한 부분만 구현; 테스트 불변·승인 증거·실제 연결 검증을 별도 보고.

## 미정 질문과 현재 검증

C-12: 정확히1km 포함·후보 정렬. C-13: 다른 자연어·누락 날짜·장소. C-14: 기존 결제창 생성점유와 새 독립점유의 시작/연결·재요청. C-15: 터미널명령→해당점유 승인파일 존재+유효 점유와 사용자 가드 보호는 확정; 파일 경로/규약·인증/transport/SDK·재사용·링크 형태는 미정. C-05·09·10·11의 전체 미정도 유지한다.

정적 문서·소스 읽기: 수행. 에이전트 직접 테스트 실행은 `NOT_RUN`이다. 부모가 전달한 이전32개 버전 SHA-256은 `869be7312077d0f3d5e56032fc288aca9ed4feceff43e40da314298858411b1f`이며 Stop 훅 실제 실행에서 함수 미구현32개 `FAIL`, 기존156개 `PASS`, 타입검사 `PASS`였다. 해당 신규 사례별 실패 이력은1회이며 이것이 사용자 테스트 확인이나 구현 착수 승인 근거가 되지는 않는다. 제품 구현 범위가 아니므로 실패를 없애기 위한 소스 수정은 하지 않는다.

승인 파일 계약을 반영한 새34개 테스트는 부모 정적 확인만 수행했고 실행은 `NOT_RUN`, 사용자 명시 확인 대기이다. 실제 approve 명령 동작 테스트는 미작성·미구현·`NOT_RUN`이며 승인파일/가드/호스트/MCP/브라우저/토스 통합도 `NOT_RUN`이다. 미정 정책 의존 통합 경로는 `BLOCKED`이다. 제품 소스와 기타 설정은 에이전트가 변경하지 않았다. 별도로 발견된 사용자 `.codex/guard.sh` 변경은 사용자 작업이며 되돌리지 않는다.

최종 테스트 작성 근거: 테스트 담당 보고 SHA-256 `d1be3974a189d99782650d9024451d5142a5ff342eb08a190a1775c886bd6692`, 34개(시간4·검색16·점유3·승인파일6·링크기한5). 승인파일6개는 부재2개(승인주장 포함), 해당점유 유효1개, 정확만료/직후2개, 다른점유1개이다. 테스트 이름은 확정 AC-18-7에 대응하며 조건부 통합 AC-18-6의 완료를 뜻하지 않는다. 이 해시는 검토용이며 아직 사용자 승인 해시가 아니다.
