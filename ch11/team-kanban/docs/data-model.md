# 팀 칸반 데이터 구조

Supabase 프로젝트: `team-kanban` (프로젝트 ID는 각자 만든 프로젝트의 값을 사용)

적용한 마이그레이션: `20261004204533_create_kanban_tables`

| 테이블 | 필드 | 관계 |
| --- | --- | --- |
| boards | id UUID PK, name text, description text, created_at timestamptz | 보드 하나에 컬럼 여러 개 |
| columns | id UUID PK, board_id UUID FK, name text, position integer, created_at timestamptz | board_id → boards.id |
| cards | id UUID PK, column_id UUID FK, title text, description text, position integer, created_at timestamptz | column_id → columns.id |

모든 필드는 NOT NULL이다. id는 자동 생성하고 created_at은 생성 시각을 기본값으로 사용한다. description 기본값은 빈 문자열이다. name과 title은 공백만 입력할 수 없다.

position은 0 이상의 정수이며 생성 시 명시한다. 컬럼은 같은 보드 안에서, 카드는 같은 컬럼 안에서 position 오름차순으로 정렬한다. 동일한 position이 있으면 id 오름차순으로 정렬한다. position에는 유일성 제약을 두지 않는다. 실제 공동 편집의 순서 변경 및 충돌 처리는 이후 단계에서 구현한다.

카드의 보드는 columns를 통해 조회한다. cards에 board_id를 중복 저장하지 않는다. 보드를 삭제하면 소속 컬럼과 카드가, 컬럼을 삭제하면 소속 카드가 ON DELETE CASCADE로 삭제된다.

정렬과 외래키 조회를 위한 인덱스:

- columns(board_id, position, id)
- cards(column_id, position, id)

세 테이블 모두 RLS를 활성화했다. 첫 단계에서는 접근 정책이 없었으며, 화면 실습 단계에서 아래 임시 anon 정책을 추가했다.

- temp_anon_boards_all
- temp_anon_columns_all
- temp_anon_cards_all

모두 FOR ALL TO anon USING (true) WITH CHECK (true)이며 anon에 SELECT, INSERT, UPDATE, DELETE 권한을 부여한다. 로그인은 구현하지 않았다. 실습용 공개 접근이며, 다음 로그인 실습에서 팀 멤버십에 맞는 정책으로 교체한다.

추가 마이그레이션: `20261004204946_enable_temp_anon_and_seed_board`. '우리 팀 보드' 및 '할 일'·'진행 중'·'완료' 컬럼을 생성한다. `move_kanban_card` 함수는 SECURITY INVOKER로 실행하며, 보드 행 잠금 후 같은 보드 안에서 카드의 column_id와 양쪽 컬럼의 position을 하나의 트랜잭션으로 갱신한다.

## 검증

실시간 단계: `20261004210234_enable_kanban_realtime` 마이그레이션으로 cards와 columns를 supabase_realtime publication에 추가했다. 화면은 두 테이블의 모든 변경 이벤트를 구독하며, 이벤트 수신 시 현재 보드의 컬럼과 카드를 재조회한다.

PASS: 원격 마이그레이션 이력, 세 테이블의 필드·외래키·RLS 확인.

PASS: 원격 DB 트랜잭션에서 삽입, 카드 정렬 및 순서 수정, 잘못된 외래키 거부, 컬럼·카드 음수 position 거부, 연쇄 삭제 확인. 검증 데이터는 ROLLBACK했다.
