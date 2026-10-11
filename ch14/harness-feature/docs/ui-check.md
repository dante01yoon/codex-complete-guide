# 빈 화면 실행과 UI 점검

2026-10-11 사용자 승인: Node.js 내장 HTTP 서버 + Playwright Chromium.
T-01/C-10의 실행·브라우저 점검 부분과 T-02 빈 웹 골격 범위이다.

## 설치·실행

Node.js 24에서 저장소 루트에서 실행한다.

```sh
npm ci
npx playwright install chromium
npm run dev
```

주소는 `http://127.0.0.1:4173`이다. 서버 종료는 `Ctrl+C`이다.
`web/index.html`의 본문은 비어 있다. 소스 파일은 요청마다 다시 읽으며 브라우저 새로고침으로 반영한다.
현재 서버는 JS/TS 빌드나 HMR을 제공하지 않는다. 기능 화면 프레임워크는 후속 합의 사항이다.

다른 터미널에서 실행한다. 서버를 먼저 띄우지 않아도 점검기가 자동 시작·종료한다.

```sh
npm run check:ui
```

현재 프로젝트 서버가 이미 실행 중이면 재사용하고 종료하지 않는다.
다른 서비스가 같은 포트를 쓰면 거절한다. 포트를 변경하려면 두 명령에 같은 값을 지정한다.

```sh
PORT=4175 npm run dev
PORT=4175 npm run check:ui
```

## 결과 보기

터미널에 요약과 절대 경로를 출력한다. `artifacts/ui/<실행 시각-식별자>/`에 저장한다.

| 파일 | 내용 |
|---|---|
| mobile.png | Chromium 모바일 에뮬레이션, viewport 390×844, DPR 1 |
| desktop.png | Chromium 데스크톱, viewport 1440×900, DPR 1 |
| summary.txt | 크기별 상태·오류 목록과 서버 로그 건수·오류 건수 |
| report.json | 구조화된 점검 결과 |
| server.log | 해당 서버 세션에서 이번 점검 시간 동안 발생한 로그 |

전체 서버 로그는 `artifacts/ui/server.jsonl`에 누적한다. 생성물은 Git에서 제외한다.
인증 헤더·토스 키 형식·일부 URL 비밀값은 가린다. 자유 형식 로그의 모든 비밀값을 자동 식별하는 것은 아니므로
앱에서 비밀값을 출력하지 않아야 한다.

종료 코드: `0` PASS, `1` FAIL, `2` BLOCKED.
콘솔 오류·미처리 JS 오류·요청 실패·HTTP 400 이상·서버 오류는 FAIL이다.
콘솔 경고는 목록에 기록하되 단독으로 실패 판정하지 않는다.
Chromium 미설치·서버 미준비는 BLOCKED로 사유를 출력한다.
초기 로드와 폰트 준비 후 500ms를 관찰해 전체 페이지를 캡처한다.
스크린샷은 스크롤 길이에 따라 viewport 높이보다 길 수 있다.

이 도구의 PASS는 초기 로드 점검 결과이다. 에이전트는 저장된 두 이미지를 직접 열어
화면을 검토해야 한다. 사용자 동작·제품 AC·토스 결제·실제 휴대폰 검증은 별도 수행한다.

[Playwright Page API](https://playwright.dev/docs/api/class-page)와
[브라우저 설치 문서](https://playwright.dev/docs/browsers)를 참고했다.

## 이번 실행 근거 (2026-10-11)

| 확인 | 결과 |
|---|---|
| npm run check:ui, 서버 자동 시작·종료 | PASS — mobile/desktop 각각 오류 0건, 서버 로그 오류 0건 |
| npm run dev 후 npm run check:ui | PASS — reused, 두 크기 캡처, 점검 후 서버 health 응답 확인 |
| 두 스크린샷 직접 열람 | PASS — 390×844·1440×900 흰 빈 화면 |
| 다른 서비스가 쓰는 임시 포트 | PASS — 모의 서버를 거절, BLOCKED 및 종료 코드 2 |
| 모의 console.error/warning·uncaught JS·404 | PASS — 두 크기에서 수집, FAIL 및 종료 코드 1; 제품 기능 실패와 별개 |
| 인증값 가림 | 첫 검사 FAIL → 구현 수정 후 PASS. 테스트 파일·제품 정책 변경 없음 |
| web 밖 파일·잘못된 URL 요청 | PASS — 400/403/404로 거절 |
| 기존 규칙 테스트·타입 검사 | PASS — 3개 파일·55개 테스트, 타입 오류 없음 |
| 제품 AC-01-1·AC-03-1, T-48·T-49, 토스 실연결 | NOT_RUN — 빈 실행 기반만 검증 |

T-01/C-10 전체 완료로 간주하지 않는다. 저장·로그인·기능 화면 기술·키 준비는 미정이다.
테스트 파일·훅·예약 규칙·원본 데이터는 변경하지 않았다. 배포하지 않았다.
