# 12장 PRD로 만들고 싶은 제품 구체화하기

『코덱스 완벽 가이드』 12장 실습 자료입니다. 챗GPT 앱(macOS, Codex CLI 0.160.0 내장)과 GPT-6.1-Sol(medium)로 진행했습니다. 작성 기준일은 2026년 10월 5일입니다.

[실습 12]에서는 11장의 서울 충전소 데이터 위에 만들 가상 예약 서비스의 문서만 만듭니다. 코드는 13장부터 만듭니다.

| 파일 | 내용 |
|---|---|
| `ev-booking/docs/prd.md` | PRD. 배경과 문제, 목표와 성공 지표, 대상 사용자, 범위와 범위 밖, 확정된 정책, 유저 스토리 17개, 열린 질문 |
| `ev-booking/docs/acceptance.md` | 유저 스토리별 수용 기준 66개(GIVEN/WHEN/THEN, AC 번호) |
| `ev-booking/docs/tasks.md` | 구현 작업 T-01~T-49와 구현 전 확인 항목 C-01~C-10 |
| `ev-booking/AGENTS.md` | 작업 전에 세 문서를 읽고, 문서에 없는 정책은 묻도록 한 작업 규칙 |
| `prompts.md` | 12장에서 보낸 요청 프롬프트 전체 |

## 사용 방법

`ev-booking` 폴더를 11장의 `ev-map` 폴더와 같은 위치(예: `~/Documents/Codex/ev-booking`)에 두세요. PRD와 AGENTS.md가 충전소 데이터를 `../ev-map/data`에서 찾습니다.

이 서비스는 학습용 가상 예약 서비스입니다. 실제 충전기를 예약하지 않으며 배포하지 않습니다. 결제는 토스페이먼츠 테스트 모드만 사용합니다.
