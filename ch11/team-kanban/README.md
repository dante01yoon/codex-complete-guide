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

## 임시 접근 정책

프로젝트 team-kanban에 세 마이그레이션을 적용했다. 두 번째 마이그레이션은 기본 보드·컬럼과 temp_anon_boards_all, temp_anon_columns_all, temp_anon_cards_all 정책을 생성한다. 세 번째 enable_kanban_realtime은 cards와 columns를 supabase_realtime publication에 추가한다.

세 정책은 실습용으로 로그인 없이 모든 행의 읽기·쓰기를 허용한다. 다음 로그인 실습에서 이 정책을 제거하고 팀 접근 정책으로 교체하며 anon 테이블 권한과 move_kanban_card 실행 권한도 회수한다. 로그인 UI나 사용자 테이블은 만들지 않았다.

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

시각 검수: 생성한 화면 콘셉트와 내장 브라우저 스크린샷의 헤더, 제목·문구, 컬럼 구성, 카드·손잡이, 입력·추가 컨트롤을 비교했다. 필수 문구와 기능 구성은 유지했다. 현재 기본 뷰포트에 맞춰 글자 크기와 간격을 줄였으며, 카드 데이터는 실제 검증 과정에서 추가한 네 장이다.

데이터 구조는 docs/data-model.md에 정리했다.
