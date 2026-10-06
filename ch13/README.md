# 13장 명세와 테스트를 기준으로 구현하는 스펙·테스트 주도 개발

『코덱스 완벽 가이드』 13장 실습 자료입니다. 챗GPT 앱(macOS, Codex CLI 0.160.0 내장)과 GPT-6.1-Sol(medium)로 진행했습니다. 작성 기준일은 2026년 10월 6일입니다.

`tdd-practice/`는 ‘13.4 코덱스로 TDD 수행하기’와 13.7·13.8에서 쓰는 충전 요금 계산 연습 프로젝트의 시작 상태입니다. 수용 기준(`docs/acceptance.md`)과 개발 환경만 들어 있고 `src/`와 `tests/`는 비어 있습니다. `npm ci`로 설치한 뒤 챗GPT 앱에 프로젝트로 추가해 책의 순서대로 요청해 보세요.

`ev-booking/`은 [실습 13]을 마친 상태의 충전소 예약 서비스입니다. 12장의 문서에 스펙킷(1.1.0) 설정과 예약 규칙 코드가 더해졌습니다.

| 파일 | 내용 |
|---|---|
| `ev-booking/.specify/memory/constitution.md` | 테스트 우선(NON-NEGOTIABLE) 조항을 넣은 프로젝트 헌법 |
| `ev-booking/specs/001-reservation-compatibility-rules/` | 예약 겹침·커넥터 호환 기능의 spec, plan, tasks |
| `ev-booking/src/rules/` | 겹침 판정(overlap), 환불 계산(refund), 체크인 시각(checkin) 순수 함수 |
| `ev-booking/tests/rules/` | 수용 기준(AC) 번호를 이름에 넣은 Vitest 테스트 55개 |
| `prompts.md` | 13장에서 보낸 요청과 명령 |

## 실행 방법

```sh
cd ev-booking
npm ci
npx vitest run
```

`ev-booking` 폴더는 11장의 `ev-map` 폴더와 같은 위치에 두세요. 이 서비스는 학습용 가상 예약 서비스입니다.
