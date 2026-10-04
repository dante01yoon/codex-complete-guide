# 실제 DB RLS 검증 전후 비교

동일한 scripts/test-rls.mjs로 정책 교체 전과 후를 실행했다. 각 역할은 실제 Auth 로그인 및 PostgREST/RPC HTTP 요청을 사용했다.

| 역할 | 테스트 수 | 변경 전 PASS | 변경 전 FAIL | 변경 후 PASS | 변경 후 FAIL |
| --- | --- | --- | --- | --- | --- |
| alice | 23 | 18 | 5 | 23 | 0 |
| bob | 26 | 18 | 8 | 26 | 0 |
| carol | 19 | 5 | 14 | 19 | 0 |
| anon | 19 | 6 | 13 | 19 | 0 |

전체: 변경 전 47 PASS / 40 FAIL / 0 BLOCKED → 변경 후 87 PASS / 0 FAIL / 0 BLOCKED. 총 87개.

## 실패에서 통과로 바뀐 항목

| 역할 | 테스트 | 변경 전 | 변경 후 |
| --- | --- | --- | --- |
| alice | cards.cross_board_reassignment | rows=1 | PASS (42501) |
| alice | columns.cross_board_reassignment | rows=1 | PASS (42501) |
| alice | boards.change_creator | rows=1 | PASS (42501) |
| alice | members.remove | PGRST202 | PASS (remaining=0) |
| bob | cards.cross_board_reassignment | rows=1 | PASS (42501) |
| bob | columns.cross_board_reassignment | rows=1 | PASS (42501) |
| bob | boards.change_creator | rows=1 | PASS (42501) |
| bob | members.remove | PGRST202 | PASS (P0001) |
| carol | cards.select | rows=1 | PASS (rows=0) |
| carol | cards.insert | rows=1,unchanged=false | PASS (42501) |
| carol | cards.update | rows=1,unchanged=false | PASS (rows=0,unchanged=true) |
| carol | cards.delete | rows=1,unchanged=false | PASS (rows=0,unchanged=true) |
| carol | columns.select | rows=1 | PASS (rows=0) |
| carol | columns.insert | rows=1,unchanged=false | PASS (42501) |
| carol | columns.update | rows=1,unchanged=false | PASS (rows=0,unchanged=true) |
| carol | columns.delete | rows=1,unchanged=false | PASS (rows=0,unchanged=true) |
| carol | boards.select | rows=1 | PASS (rows=0) |
| carol | boards.update | rows=1,unchanged=false | PASS (rows=0,unchanged=true) |
| carol | board_members.select | rows=2 | PASS (rows=0) |
| carol | cards.move_rpc | moved=true | PASS (P0001) |
| carol | members.remove | PGRST202 | PASS (P0001) |
| carol | boards.delete | rows=1,unchanged=false | PASS (rows=0,unchanged=true) |
| anon | cards.select | rows=1 | PASS (42501) |
| anon | cards.insert | rows=1,unchanged=false | PASS (42501) |
| anon | cards.update | rows=1,unchanged=false | PASS (42501) |
| anon | cards.delete | rows=1,unchanged=false | PASS (42501) |
| anon | columns.select | rows=1 | PASS (42501) |
| anon | columns.insert | rows=1,unchanged=false | PASS (42501) |
| anon | columns.update | rows=1,unchanged=false | PASS (42501) |
| anon | columns.delete | rows=1,unchanged=false | PASS (42501) |
| anon | boards.select | rows=1 | PASS (42501) |
| anon | boards.update | rows=1,unchanged=false | PASS (42501) |
| anon | cards.move_rpc | moved=true | PASS (42501) |
| anon | members.remove | PGRST202 | PASS (42501) |
| anon | boards.delete | rows=1,unchanged=false | PASS (42501) |
| alice | members.remove_owner | PGRST202 | PASS (P0001) |
| bob | boards.select_after_removal | removal-PGRST202 | PASS (rows=0) |
| bob | columns.select_after_removal | removal-PGRST202 | PASS (rows=0) |
| bob | cards.select_after_removal | removal-PGRST202 | PASS (rows=0) |
| bob | cards.update_after_removal | removal-PGRST202 | PASS (rows=0) |

변경 전 PGRST202는 내보내기 함수가 아직 없었다는 뜻이다. 이를 올바른 권한 거부로 간주하지 않고 FAIL로 처리했다. 익명 보드 생성은 기존 트리거에 의해 이미 차단되므로 PASS였다.

## 적용 내용

- 임시 정책 7개 제거, anon 테이블/RPC 권한 회수.
- boards·columns·cards·board_members에 멤버 정책 적용. UPDATE는 USING과 WITH CHECK로 이전 행과 새 소속을 모두 확인.
- 재귀 RLS를 피하는 private.member_board_ids 함수, auth.uid()의 SELECT 래핑, 기존 멤버·부모 FK 인덱스 활용. 생성자 FK 인덱스 추가.
- 생성 직후 INSERT RETURNING을 지원하기 위해 boards 읽기에는 created_by도 owner 식별자로 사용한다. owner 자동 등록 트리거 및 생성자 변경 권한 제한으로 생성자=owner 불변식을 유지한다.
- 멤버 직접 쓰기·owner 승격·생성자 변경 금지. 초대·내보내기는 DB 함수에서도 owner 확인. owner는 내보낼 수 없다.
- Bob을 테스트 전용 보드에서 내보낸 뒤 기존 JWT로 재요청해 읽기·수정이 차단됨을 확인.

테스트 전용 fixture는 모두 정리했고 기존 우리 팀 보드의 Alice owner / Bob member와 카드 데이터는 유지했다. Carol은 기존 보드의 멤버가 아니다. 테스트 비밀번호는 .env.local에만 있다.

npm run build 및 기존 순서 테스트 3개 PASS. 실제 회원가입 메일 수신·네트워크 재연결·실시간 멤버 내보내기 알림은 이 테스트의 범위에 포함하지 않았다.

보안 advisor: 기존 Leaked Password Protection Disabled WARN 1건은 유지된다. [관련 안내](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).

생성자 FK 인덱스 추가 후 unindexed foreign key 항목은 없어졌다. 새 boards_created_by_idx에는 아직 사용 통계가 없어 Unused Index INFO가 표시된다. FK와 owner 읽기 경로 지원을 위해 유지했다. [관련 안내](https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index).

실행: npm run test:rls -- after. 결과 JSON은 docs/rls-results-before.json과 docs/rls-results-after.json에 보관한다.
