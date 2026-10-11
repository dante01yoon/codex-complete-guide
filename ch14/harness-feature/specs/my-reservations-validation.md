# 내 예약 시연 검증 — 2026-10-11

## 승인·범위

사용자: “확인했어. 그대로 진행하고, 다 되면 커밋한 다음 화면에서 뭘 보고 뭘 고쳤는지 정리해 줘.”
`my-reservations-design.md`와 7개 실행 가능한 테스트를 명시 확인했다.
승인 파일 SHA-256은 구현 전후 동일:
`17ca992df94abbfe9c96944719ff17d201f47abb3833b8a8ccb328ce86253605`.

US-06/07, T-21/T-24 화면·T-23 모의 취소 부분만 해당한다.
서울 고정 시각 2026-10-12 10:00, 150/60/20분 전 예약 3개·각 60분,
초기 예약에만 1건 제한·시작 단위 예외. 금액은 기존 `reduceUserCancellation` 재사용.
원본에서 국회도서관 ME183103/02·52, sh서울주택도시공사 ME18B278/11의
저장된 이름·주소·식별자를 읽었다. 원본 수정·재수집은 하지 않았다.

## Red → Green 실행 기록

| 검사 | 결과 | 실행 근거 |
|---|---|---|
| 구현 전 `node --test specs/my-reservations.acceptance.test.mjs` | FAIL | 0/7. 6개는 src/server/reservations.ts 부재, 브라우저는 빈 화면에 내 예약 제목 없음. 환경·인증 실패가 아닌 기능 미구현 |
| 구현 후 같은 명령 | PASS | 7/7. 각 150/60/20분 전 취소 3,000/1,500/0원, 반복 보호, 조회 유지, 확인 전 유지, 확인 후 세 금액, 모바일 넘침 없음 |
| 화면 수정 후 같은 명령 | PASS | 7/7. 승인 파일 불변 |
| `npm run test:rules` | PASS | 기존 3개 파일·55개 테스트 |
| `npm run typecheck` | PASS | 기존 tsconfig 범위, 종료 0 |
| 서버 신규 TS 별도 검사 | PASS | `npx tsc --ignoreConfig --noEmit --strict --skipLibCheck --target ES2023 --module NodeNext --moduleResolution NodeNext --allowImportingTsExtensions --types node src/server/reservations.ts src/server/demo-data.ts` 종료 0 |
| `npm run lint` | PASS | 10개 파일·오류 0. 화면/API에 도메인 계산 중복 없음 |
| `node --test demo/acceptance.test.mjs` | PASS | 기존 하네스 3개 |
| `git diff --check` | PASS | 공백 오류 없음 |
| 기존 tests/rules 변경 확인 | PASS | diff 없음. 새 승인 시연 테스트는 specs 아래 별도 파일 |

각 새 사례의 최초 연속 실패 횟수는 1, 구현 후 성공으로 해소했다.
훅 차단이나 테스트 변경·스킵·검사 설정 변경은 없었다.
신규 서버 TS 추가 검사에서는 처음 CLI 파일 지정 시 TS5112가 발생했고,
`--ignoreConfig`를 추가한 뒤 Node 타입 지정이 없어 TS2591이 발생했다.
`--types node`를 명시한 최종 명령은 PASS. 소스·테스트·tsconfig를 바꿔 숨기지 않았다.

## 직접 본 화면과 수정

Browser plugin/skill은 사용 가능 목록에 없어 합의한 Playwright Chromium 사용.
로컬 URL `http://127.0.0.1:4173/`, 제목 `내 예약 · ev-booking`.
390×844 모바일, 1440×900 데스크톱에서 실제 렌더를 캡처하고 이미지 도구로 열어 확인했다.

| 관찰 | 수정 | 다시 확인한 결과 |
|---|---|---|
| 모바일 ‘시작까지’ 숫자에 공통 strong 스타일이 적용되어 13px로 작게 보임 | countdown 전용 선택자로 22px 적용 | 계산 스타일 22px, 150분 표시 직접 확인 |
| 모바일 소개 문장이 마지막 ‘요.’만 혼자 줄바꿈됨 | 시연 운전자 표시를 헤더 오른쪽에 배치하고 소개 문장 폭 확보 | 한 줄 안내, 헤더 겹침·가로 넘침 없음 |
| 0원 확인창은 전액 환불과 같은 녹색 배경 | 0원에 카드와 같은 주황색 배경·금액 색 적용 | 0원 및 미반환 3,000원이 명확히 보임 |
| 모바일 취소 버튼 터치 영역 | 최소 높이 44px로 보완 | 카드에서 버튼과 금액 영역 구분 확인 |

확인 동선: 내 예약 → 각 카드 예약 취소 → 예약 유지 → 확정 상태 유지 →
다시 예약 취소 → 모의 취소 확정 → 사용자 취소·금액 결과 → 새로고침 유지.
Esc 닫기도 확인창만 닫고 예약 상태를 유지한다. 처리 중 중복 클릭을 막고
완료 후 취소 버튼 제거, 성공 안내에 초점 이동. 확인창은 native dialog 사용.
추가 직접 조작에서 1,500원 취소 결과와 새로고침 유지도 확인했다.
페이지 내용·제목·콘솔·오류 화면·확인창·버튼 결과·모바일 폭은 PASS.
pageerror/console error·warning 0, 모바일 문서 폭 390px.

스크린샷(로컬 임시 증거):
- `/tmp/ev-booking-mobile-before.png` / `/tmp/ev-booking-mobile-after.png`
- `/tmp/ev-booking-dialog.png` / `/tmp/ev-booking-dialog-after.png`
- `/tmp/ev-booking-desktop-after.png` / `/tmp/ev-booking-cancelled.png`

`npm run check:ui`도 휴대폰·데스크톱 초기 화면 PASS, 각 issues=0,
서버 로그 오류 0을 확인했다. 이는 초기 화면 검사이며 취소 기능 검증은
위 승인 테스트와 별도 직접 조작의 근거로 구분한다.

## 실행과 한계

`npm run dev`, 주소 `http://127.0.0.1:4173/`. 종료 Ctrl+C.
시연용 시계는 서버 고정값이며 브라우저 실제 시간을 사용하지 않는다.
취소 결과는 서버 메모리, 새로고침 유지·재시작 초기화.
직접 조작 후 서버를 재시작하여 사용자에게는 세 초기 예약을 제공한다.

| 미검증 범위 | 상태 |
|---|---|
| 실제 토스 테스트 결제·환불 T-18/T-47 | NOT_RUN — 요청한 모의 처리만 수행 |
| 로그인·소유자 권한 T-08 및 AC-03-4 | NOT_RUN — 단일 시연 운전자, 인증 없음 |
| 신규 일반 예약 제한 AC-03-2·AC-04-2 | NOT_RUN — 일반 생성 흐름 없음, 초기값에만 승인 예외 |
| 노쇼·체크인·종료·대기 승계·시계 진행 및 복구 | NOT_RUN — 이번 화면 범위 밖 |
| 실제 휴대폰·다른 브라우저 | NOT_RUN — Chromium viewport 검증 |

일반 정책·열린 질문·조건부 AC는 위 부분 승인 밖에서 유지한다.
전체 T-21/T-23/T-24 또는 전체 서비스 AC 통과로 확대하지 않는다.
