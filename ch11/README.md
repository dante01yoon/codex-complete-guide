# 11장 수파베이스로 데이터 저장하고 사용자 보호하기

『코덱스 완벽 가이드』 11장 실습 자료입니다. 챗GPT 앱(macOS, Codex CLI 0.160.0 내장)과 GPT-6.1-Sol(medium)로 진행했습니다. 작성 기준일은 2026년 10월 4일입니다.

`team-kanban/`은 [실습 09]에서 만든 팀 칸반 보드입니다. Vite, React, 타입스크립트, supabase-js, dnd-kit으로 만들었습니다.

| 파일 | 내용 |
|---|---|
| `team-kanban/supabase/migrations/` | 보드·컬럼·카드 테이블, 실습용 임시 정책(temp_), 실시간 구독 설정 |
| `team-kanban/docs/data-model.md` | 테이블 구조와 관계 |
| `team-kanban/src/App.tsx` | 칸반 보드 화면(카드 추가·끌어서 이동·실시간 반영) |

## 실행 방법

1. 수파베이스에 프로젝트를 만들고 `supabase/migrations`의 SQL을 순서대로 적용합니다. 책처럼 코덱스의 Supabase 플러그인에게 맡겨도 됩니다.
2. `.env.example`을 `.env.local`로 복사하고 내 프로젝트의 주소와 publishable 키를 넣습니다.
3. 아래 명령으로 실행합니다.

```sh
cd team-kanban
npm ci
npm run dev
```

## 주의

- `temp_`로 시작하는 정책은 로그인 없이 누구나 읽고 쓸 수 있게 여는 실습용 정책입니다. 이 상태로 배포하지 마세요. [실습 10]에서 로그인과 멤버 권한으로 교체합니다.
- `.env.local`은 저장소에 올리지 않습니다. secret 키(service_role)는 브라우저 코드에 절대 넣지 마세요.
- 실습을 마친 수파베이스 프로젝트는 일시 중지하거나 삭제하세요.
