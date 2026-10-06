# 팀 칸반 데이터 구조

Supabase 프로젝트: `team-kanban` (프로젝트 ID는 각자 만든 프로젝트의 값을 사용)

적용한 마이그레이션: `20261004204533_create_kanban_tables`

| 테이블 | 필드 | 관계 |
| --- | --- | --- |
| boards | id UUID PK, name text, description text, created_at timestamptz, created_by UUID FK | created_by → auth.users.id, 보드 하나에 컬럼 여러 개 |
| columns | id UUID PK, board_id UUID FK, name text, position integer, created_at timestamptz | board_id → boards.id |
| cards | id UUID PK, column_id UUID FK, title text, description text, position integer, created_at timestamptz | column_id → columns.id |
| board_members | board_id UUID FK, user_id UUID FK, role text, created_at timestamptz | 복합 PK(board_id, user_id), board_id → boards.id, user_id → auth.users.id |

created_by를 제외한 모든 필드는 NOT NULL이다. id는 자동 생성하고 created_at은 생성 시각을 기본값으로 사용한다. description 기본값은 빈 문자열이다. name과 title은 공백만 입력할 수 없다. created_by는 auth.uid() 기본값을 사용하며, 새로운 보드의 생성자는 owner 트리거에서 로그인 사용자와 일치하는지 확인한다.

role은 owner 또는 member이다. 보드당 owner는 한 명이며 보드를 만들면 생성자를 자동 등록한다. 보드 또는 사용자가 삭제되면 해당 board_members도 CASCADE로 삭제한다. 사용자가 삭제될 때 boards.created_by는 NULL로 바뀐다.

Auth 단계 마이그레이션: 20261004213024_add_auth_and_board_members. 당시에는 temp_anon_* 정책을 유지하고 temp_authenticated_* 실습 정책을 추가했다.

현재 RLS 단계: 20261004214533_enforce_board_member_rls로 모든 temp_ 정책을 제거했고 anon 테이블·카드 이동 RPC 접근을 회수했다. boards·columns·cards는 해당 보드 owner/member만 접근한다. 새 보드는 로그인 사용자가 생성하고 즉시 owner가 된다. UPDATE는 USING과 WITH CHECK로 이전 행과 새 소속을 모두 검사한다. board_members는 해당 보드의 멤버만 읽으며 직접 쓰기는 허용하지 않는다. 멤버 초대·내보내기는 owner 검사 함수에서 처리한다. 생성자 변경은 UPDATE 열 권한으로 차단한다. 생성 직후 INSERT RETURNING을 위해 boards 읽기 정책은 생성자도 owner로 식별한다.

추가 인덱스: 20261004214656_index_board_creators의 boards(created_by). 기대 권한과 실제 요청 결과는 rls-expectations.md와 rls-comparison.md를 참조한다.

position은 0 이상의 정수이며 생성 시 명시한다. 컬럼은 같은 보드 안에서, 카드는 같은 컬럼 안에서 position 오름차순으로 정렬한다. 동일한 position이 있으면 id 오름차순으로 정렬한다. position에는 유일성 제약을 두지 않는다. 현재 카드 이동은 보드 행 잠금으로 직렬화하고 양쪽 컬럼의 순서를 다시 부여한다. 동시 카드 추가는 같은 position이 생길 수 있어 id로 정렬한다.

카드의 보드는 columns를 통해 조회한다. cards에 board_id를 중복 저장하지 않는다. 보드를 삭제하면 소속 컬럼과 카드가, 컬럼을 삭제하면 소속 카드가 ON DELETE CASCADE로 삭제된다.

정렬과 외래키 조회를 위한 인덱스:

- columns(board_id, position, id)
- cards(column_id, position, id)

세 테이블 모두 RLS를 활성화했다. 첫 단계에서는 접근 정책이 없었으며, 화면 실습 단계에서 아래 임시 anon 정책을 추가했다.

- temp_anon_boards_all
- temp_anon_columns_all
- temp_anon_cards_all

당시 정책은 모두 FOR ALL TO anon USING (true) WITH CHECK (true)이었고 anon에 SELECT, INSERT, UPDATE, DELETE 권한을 부여했다. 이후 로그인·멤버 기능을 구현했으며 현재는 이 임시 정책을 모두 제거하고 위의 멤버 접근 정책으로 교체했다.

추가 마이그레이션: `20261004204946_enable_temp_anon_and_seed_board`. '우리 팀 보드' 및 '할 일'·'진행 중'·'완료' 컬럼을 생성한다. `move_kanban_card` 함수는 SECURITY INVOKER로 실행하며, 보드 행 잠금 후 같은 보드 안에서 카드의 column_id와 양쪽 컬럼의 position을 하나의 트랜잭션으로 갱신한다.

## 검증

실시간 단계: `20261004210234_enable_kanban_realtime` 마이그레이션으로 cards와 columns를 supabase_realtime publication에 추가했다. 화면은 두 테이블의 모든 변경 이벤트를 구독하며, 이벤트 수신 시 현재 보드의 컬럼과 카드를 재조회한다.

PASS: 원격 마이그레이션 이력, 세 테이블의 필드·외래키·RLS 확인.

PASS: 원격 DB 트랜잭션에서 삽입, 카드 정렬 및 순서 수정, 잘못된 외래키 거부, 컬럼·카드 음수 position 거부, 연쇄 삭제 확인. 검증 데이터는 ROLLBACK했다.
