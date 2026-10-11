# Agent Graph 화면 검증

- 실행: `node demo/graph-server.mjs`
- 주소: http://127.0.0.1:4177
- 데이터: docs/agents.md, docs/mcp-implementation.md, docs/local-checkout-plan.md, docs/acceptance.md를 실행 시 읽음.
- PASS: 원본 Mermaid 노드 11개, 경로 14개 추출. 초기 8건 + 후속 3건 = 인계 11건.
- PASS: Codex 앱 브라우저에서 인계 11건 각각 클릭. 상세 발신/수신과 강조 화살표 확인. 원본에 없는 기록 경로는 선택 시 점선으로 표시.
- PASS: 이전/다음 버튼에서 단계 및 화살표 변경.
- PASS: AC-18-1~10 표 10행, 문서의 계약 집계 근거와 실제 연결 범위 분리.
- PASS: 기록 없음과 명시적인 리뷰 0건, FAIL, BLOCKED, NOT_RUN을 구분.
- PASS: 브라우저 실제 창에서 문서 전체 가로 넘침 없음.
- PASS: graph-app.mjs JavaScript 구문 검사.
- PASS: git status에서 demo/만 신규 변경. src, tests, docs 변경 없음.
- 화면: graph-preview.png (MCP 인계 6 선택).

이 검증은 대시보드 동작의 검증이다. 기록의 59/59, 168/168, 171/171은 기존 문서에서 읽은 과거 결과이며 이번 작업에서 예약 테스트를 재실행하지 않았다. AC별 PASS는 문서의 AC-18-1~10 커버리지와 계약 테스트 집계로 표시한다. 개별 테스트 수, 실행 시각, 소요 시간은 기록 없음. 승인 파일 생성과 사람용 승인 CLI, 결제, 배포는 수행하지 않았다.
