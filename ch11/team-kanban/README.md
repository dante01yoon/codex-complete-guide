# 팀 칸반 실습

Vite + React + TypeScript + supabase-js + dnd-kit으로 만든 칸반 보드.

## 실행

Node.js 24 이상을 사용한다. 의존성 버전과 package-lock.json을 고정했다.

```sh
npm ci
npm run dev
```

개발 URL: http://127.0.0.1:5174/

주소와 공개 키는 .env.local에 설정했다. 해당 파일은 .gitignore에 포함된다. 새 환경에서는 .env.example을 복사해 VITE_SUPABASE_URL과 VITE_SUPABASE_PUBLISHABLE_KEY를 설정한다. VITE_ 변수는 브라우저 번들에 포함되므로 publishable 키만 사용한다.

## 사용

각 컬럼 아래 입력란에 제목을 입력하고 추가를 누른다. 카드 왼쪽 점 손잡이를 끌어 같은 컬럼의 다른 카드 위 또는 다른 컬럼으로 옮긴다. 빈 컬럼이나 컬럼의 빈 공간에 놓으면 마지막 위치에 추가된다. 이동 시 column_id 및 position을 DB 함수 한 번으로 저장하고 DB에서 목록을 다시 읽는다. 저장 실패는 화면에 표시한다.

cards와 columns의 INSERT·UPDATE·DELETE를 Supabase Realtime으로 구독한다. 다른 사용자가 카드를 추가하거나 옮기면 새로고침 없이 보드가 갱신된다. 한 번의 이동에서 발생하는 여러 행 변경을 100ms 동안 묶고 현재 보드의 데이터를 다시 읽는다. 재연결 시에도 다시 읽어 연결이 끊긴 동안의 변경을 반영한다. 화면을 떠나면 채널과 예약된 갱신을 정리한다.

오른쪽 위 '실시간 연결됨'은 실제 채널 SUBSCRIBED 상태에서 표시한다. 연결 중·연결 끊김 상태와 목록 갱신 오류도 별도로 표시한다. 새로고침 버튼은 수동 복구용으로 유지한다.

카드 추가 시 마지막 position + 1을 사용하며 동시 추가는 같은 position이 생길 수 있다. 이 경우 id로 정렬한다. 이동은 보드 잠금으로 직렬화하고 해당 컬럼들의 순서를 0부터 다시 부여한다.

## 접근 권한

프로젝트 team-kanban에 여섯 마이그레이션을 적용했다. 최초 구조·시드·Realtime·Auth 변경에 이어 enforce_board_member_rls로 임시 정책을 제거하고, index_board_creators로 생성자 외래키 인덱스를 추가했다.

이전 Auth 실습에서는 임시 정책을 유지했지만, RLS 실습에서 테스트를 먼저 작성하고 정책 변경 전 87개 중 40개 실패를 확인한 뒤 모든 temp_ 정책을 제거했다. 현재는 보드 owner/member만 보드·컬럼·카드에 접근할 수 있다. 새 보드는 로그인 사용자가 생성할 수 있으며 생성자가 자동으로 owner가 된다. anon의 테이블 접근과 move_kanban_card 실행 권한을 회수했다.

멤버 목록은 보드 참여자만 읽는다. 멤버 등록·내보내기는 owner 전용 RPC에서 처리하고 직접 board_members 쓰기는 차단한다. owner는 내보낼 수 없다. 보드의 생성자 필드는 클라이언트에서 변경할 수 없다.

실제 Auth/JWT와 PostgREST 요청으로 동일한 테스트를 다시 실행해 87개 모두 통과했다. HTTP 200만으로 성공을 판단하지 않고 반환 행과 실제 저장 결과를 확인한다. 테스트용 fixture는 정리했고 기존 보드 데이터는 유지했다.

- 기대 권한 표: docs/rls-expectations.md
- 동일한 전후 테스트: scripts/test-rls.mjs
- 전후 비교: docs/rls-comparison.md
- 원본 결과: docs/rls-results-before.json, docs/rls-results-after.json

```sh
npm run test:rls -- after
```

테스트는 로컬 Supabase CLI 인증을 필요로 한다. 관리 키는 fixture 구성·확인·정리에만 사용하고 테스트 요청은 각 역할의 공개 키/JWT로 실행한다. 출력에 비밀번호·JWT·관리 키를 포함하지 않는다.

## 로그인과 멤버

Supabase Auth 이메일·비밀번호 회원가입, 로그인, 로그아웃을 지원한다. 새로고침 시 세션을 복원하며 로그인하지 않으면 보드 컴포넌트와 Realtime 구독을 실행하지 않는다. 일반 회원가입의 이메일 확인 흐름은 프로젝트 Auth 설정을 따른다.

보드 목록은 로그인한 사용자의 board_members를 조회해 구성한다. 새 보드는 create_team_board로 생성하며 기본 컬럼 세 개와 owner 멤버를 같은 트랜잭션에서 만든다. boards.created_by의 기본값은 auth.uid()이고 DB 트리거가 생성자를 owner로 등록한다. 이전 실습 보드 '우리 팀 보드'에는 Alice를 owner로 연결했다.

owner는 가입한 사용자의 정확한 이메일을 입력해 멤버를 초대한다. 이메일 발송이나 계정 생성 초대가 아니라 기존 가입자를 보드 멤버로 즉시 등록하는 기능이다. invite_board_member 함수는 DB에서도 owner 여부를 검사하며 중복 초대를 처리한다. Auth 사용자 조회와 멤버 추가는 private 스키마의 권한 제한 함수에서 수행한다. 브라우저에는 publishable 키만 사용한다.

테스트 이메일:

- alice@team-kanban.example
- bob@team-kanban.example
- carol@team-kanban.example (기존 보드의 비멤버 역할로 테스트)

세 계정은 Admin Auth API로 email_confirm=true 상태로 생성했다. 프로젝트 전체 이메일 확인 설정은 변경하지 않았다. 비밀번호는 .env.local의 TEST_ALICE_PASSWORD, TEST_BOB_PASSWORD, TEST_CAROL_PASSWORD에만 저장하며 VITE_ 접두사를 사용하지 않는다. 테스트 이메일 변수도 같은 파일에 있다. 비밀번호는 UI나 문서에 표시하지 않는다.

scripts/seed-test-users.mjs는 로컬 Supabase CLI 인증을 이용해 테스트 계정을 준비하고 로그인을 검증한다. 관리 키는 프로세스 메모리에서만 사용하며 .env.local이나 브라우저에 저장하지 않는다. 이미 존재하는 계정의 비밀번호를 변경하지 않는다.

## 검증

- npm run build: TypeScript 검사 및 프로덕션 빌드 PASS.
- npm test: 같은 컬럼 위·아래 이동, 다른 컬럼 삽입, 빈 컬럼·빈 공간 이동 계산 3개 테스트 PASS.
- 원격 DB에서 SET LOCAL ROLE anon으로 CRUD 및 동일/다른 컬럼 이동 검증 PASS. 검증 트랜잭션은 롤백.
- 내장 브라우저 기본 뷰포트(903 × 867)에서 세 컬럼 각각 카드 추가, 실제 포인터 드래그로 같은 컬럼 재정렬·다른 컬럼 이동·빈 컬럼 이동 PASS.
- 새로고침 후 카드와 순서 유지 PASS. 관련 콘솔 error/warn 없음.
- Realtime: 내장 브라우저 두 탭에서 첫 탭 카드 추가 → 두 번째 탭 자동 표시, 반대쪽 탭의 컬럼 이동 → 첫 탭 자동 표시, 같은 컬럼 순서 변경 → 다른 탭 자동 정렬 PASS. 수신 탭에서 새로고침하지 않았다.
- 두 탭 모두 '실시간 연결됨' 표시, 관련 콘솔 error/warn 없음. 실시간 검증용 '실시간 공유 확인' 카드 한 장을 추가로 남겼다.
- columns UPDATE도 DB에서 완료 컬럼명을 잠시 변경한 뒤 원래 이름으로 복원하여 두 탭의 자동 반영 PASS. 최종 컬럼명은 원래대로 유지했다. 네트워크 차단·재연결 시나리오는 NOT_RUN.
- 모바일 390 × 844에서 단일 컬럼 레이아웃 확인. 모바일 터치 드래그는 NOT_RUN.
- Supabase 보안 advisor 결과 0건. 이는 실습용 공개 정책의 운영 안전성을 의미하지 않는다.
- Auth 단계 PASS: 미로그인 로그인 화면, 회원가입 폼 전환, Alice 로그인 → Bob 초대 → owner/member 목록 확인, 로그아웃, Bob 로그인 및 초대받은 보드 접근, 새로고침 후 세션 유지.
- DB 기능 검증 PASS: authenticated 보드 생성 시 owner 자동 등록 및 기본 컬럼 생성(롤백), Bob의 owner 초대 함수 호출 거부(롤백), 기존 temp_anon_* 정책과 두 계정 이메일 확인 완료 상태 확인.
- 회원가입 실제 제출·메일 수신 전체 흐름은 NOT_RUN. 테스트 계정은 이메일 확인을 건너뛰는 Admin API로 생성했다. 멤버별 RLS 실제 DB 테스트는 변경 전 47 PASS / 40 FAIL, 변경 후 87 PASS / 0 FAIL / 0 BLOCKED이다.
- Auth 단계 보안 advisor: Leaked Password Protection Disabled WARN 1건. 기존 Auth 설정이며 이번 단계에서는 변경하지 않았다. 안내: https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection

시각 검수: 생성한 화면 콘셉트와 내장 브라우저 스크린샷의 헤더, 제목·문구, 컬럼 구성, 카드·손잡이, 입력·추가 컨트롤을 비교했다. 필수 문구와 기능 구성은 유지했다. 현재 기본 뷰포트에 맞춰 글자 크기와 간격을 줄였으며, 카드 데이터는 실제 검증 과정에서 추가한 네 장이다.

데이터 구조는 docs/data-model.md에 정리했다.
