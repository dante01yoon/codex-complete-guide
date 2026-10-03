# 전국 도서관 MCP 서버

> **실습 전용입니다.** 이 서버와 데이터는 개인 학습과 실습에만 사용하세요. 서버를 인터넷에 배포하거나, 가공한 데이터를 공개·재배포하지 마세요. 공공데이터마다 이용 조건(출처 표시, 상업적 이용, 변경 허용 등)이 다르며, 조건이나 관련 법령을 어기면 법적 책임을 질 수 있습니다. 공개하려면 데이터 페이지의 이용 조건을 먼저 확인하세요.

## 데이터 준비

CSV 파일은 저장소에 포함하지 않습니다. [공공데이터포털 전국도서관표준데이터](https://www.data.go.kr/data/15013109/standard.do)에서 CSV를 내려받아 이 폴더에 `전국도서관표준데이터.csv` 이름으로 넣으세요. 파일은 CP949로 인코딩되어 있으며 서버가 자동으로 판별합니다.

Node.js 20 이상 / TypeScript / 공식 MCP TypeScript SDK v2.3.0 / STDIO.
공식 SDK v2는 `@modelcontextprotocol/server`와 `@modelcontextprotocol/client`로 분리되어 있습니다.
https://github.com/modelcontextprotocol/typescript-sdk

## 설치와 실행

```sh
npm ci
npm run build
node dist/server.js
```

STDIO 서버는 MCP 클라이언트가 프로세스를 시작하고 stdin/stdout으로 통신합니다.
터미널에서 직접 실행하면 입력을 기다리는 것이 정상입니다. 로그는 stderr에만 씁니다.
CSV는 서버 파일 기준으로 찾으므로 실행 작업 폴더에 의존하지 않습니다.
선택적으로 두 번째 인자에 다른 CSV의 경로를 전달할 수 있습니다.

```sh
node dist/server.js /absolute/path/data.csv
```

## CSV 처리

2026-10-03에 받은 원본 CSV(1,018,163바이트)를 검사한 결과 UTF-8 엄격 해독 실패,
EUC-KR 엄격 해독 실패, CP949 전체 해독 성공: 3,601행.
실행 시 UTF-8(선택적 BOM)을 먼저 엄격 검사하고 실패하면 CP949로 해독합니다.
CP949 왕복 바이트 일치도 검사하며 CSV의 필수 열이 없으면 시작을 중단합니다.
쉼표, 따옴표, 필드 안의 줄바꿈은 csv-parse로 처리합니다.
전화·팩스 관련 열은 로드 시 제거하고 결과, 검색 대상, ID 계산에 사용하지 않습니다.
원본 CSV 파일은 수정하지 않습니다.
데이터는 시작할 때 읽으므로 파일 교체 후 서버를 재시작하세요.

## 도구

| 도구 | 인자 | 결과 |
| --- | --- | --- |
| `search_libraries` | `sido?`, `sigungu?`, `keyword?`, `limit?`(기본 20, 최대 100), `offset?`(기본 0) | 총 검색 수, 페이지, 다음 offset, 도서관 요약과 ID |
| `stats_by_region` | `sido?` | 시도별 도서관 수·도서 장서 수·누락 수, 전체 합계 |
| `get_library` | `id` | 전화번호를 제외한 원본 상세 열, 숫자형 장서 수 |

검색 조건은 부분일치 AND이며 공백·대소문자를 정규화합니다.
키워드는 도서관명, 도로명주소, 운영기관명, 도서관유형에서 검색합니다.
시도 필터에는 CSV 표기 기준의 부분 문자열을 사용하세요(예: `서울`, `전라남도`).
조건을 모두 생략하면 전체 도서관을 페이지로 조회합니다.
상세 조회는 검색에서 받은 ID를 쓰며 없는 ID는 `isError: true`를 반환합니다.
ID는 전화번호 없는 데이터 내용의 해시로 생성되며 데이터가 바뀌면 달라질 수 있습니다.

장서 수는 `자료수(도서)`만 합산하며 연속간행물·비도서는 포함하지 않습니다.
빈 값·잘못된 숫자는 합계에서 제외하고 `missingBookCount`로 표시합니다.
CSV 행을 각각 도서관 1개로 계산하며 임의로 중복 제거하지 않습니다.
시도명은 원본을 유지합니다. 이 CSV에는 `전라남도`와 `전남광주통합특별시`가 함께 존재하여
집계 그룹이 18개입니다. 표기를 자동 통합하지 않습니다.
데이터기준일자는 각 도서관 상세에 제공됩니다.

## 실제 검증

```sh
npm test
npm run verify
```

`verify`는 공식 SDK 클라이언트로 실제 서버 프로세스를 `/tmp`에서 실행하여
initialize, tools/list, 세 도구 호출, 전화번호 제외, 페이지 조회,
존재하지 않는 ID, 잘못된 인자 처리를 검사합니다. 종료 시 서버 프로세스를 닫습니다.
결과는 `verification-result.json`에 저장합니다.

검증 결과: PASS. 단위 테스트 4개 PASS.
전국 3,601개, 도서 장서 합계 149,043,414권, 장서 누락 0개.
Python의 독립 CSV 파싱·합산 결과도 같은 수치였습니다.
검색 `{ "sido": "전라남도", "sigungu": "보성군", "keyword": "보성", "limit": 2 }`:
전체 4개 중 2개 반환. 첫 결과는 전라남도교육청보성도서관, 장서 96,794권.

## ChatGPT 데스크톱 앱 등록

공식 문서: https://learn.chatgpt.com/docs/extend/mcp

설정 → MCP servers → Add server에서 다음 값을 입력하고 저장 후 Restart:

- 이름: `library-mcp`
- 전송: `STDIO`
- 명령(command): `/path/to/node`
- 인자(args): `/path/to/library-mcp/dist/server.js`
- 추가 환경 변수나 작업 폴더 지정 불필요

인자를 배열로 받는 입력란이라면:

```json
["/path/to/library-mcp/dist/server.js"]
```

`config.toml`을 사용하는 경우 아래 설정을 추가할 수 있습니다.

```toml
[mcp_servers.library-mcp]
command = "/path/to/node"
args = ["/path/to/library-mcp/dist/server.js"]
```

Node 버전을 삭제·이동하면 command를 새 실행 파일 경로로 바꾸세요.
이 설정은 로컬 STDIO 등록용입니다. ChatGPT 웹의 원격 연결은 별도의 연결 방식이 필요합니다.
