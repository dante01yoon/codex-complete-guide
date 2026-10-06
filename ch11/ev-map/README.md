# 서울 전기차 충전기 데이터

```sh
python3 scripts/fetch_chargers.py
```

Python 표준 라이브러리만 사용합니다. 어느 폴더에서 실행해도 이 프로젝트의
`.env`에 있는 `DATA_GO_KR_KEY`를 읽습니다. 같은 이름의 환경변수가 있으면
환경변수를 우선합니다. 인증키, 요청 URL, 응답 원문, 상세 예외는 출력하지 않습니다.

| 저장 파일 | API | 캐시 유효기간 |
| --- | --- | --- |
| `data/stations.json` | `getChargerInfo` | 24시간 |
| `data/status.json` | `getChargerStatus` (`period=10`) | 10분 |

파일은 API 레코드의 JSON 배열입니다. 캐시는 파일 수정 시간을 기준으로 하며,
파일이 없거나 만료되었거나 JSON 배열 형식이 잘못되었으면 다시 조회합니다.
캐시를 사용할 때 파일 수정 시간은 바꾸지 않습니다.

서울(`zcode=11`)을 한 페이지 최대 9,999개씩 조회합니다. 응답의 `totalCount`까지
페이지를 순회하고, `totalCount`가 없으면 9,999개 미만인 페이지에서 종료합니다.
앞 요청이 끝난 후 다음 요청까지 최소 1초를 기다립니다. 실제 시도한 API 호출
횟수를 정보·상태별로, 그리고 전체 합계로 출력합니다. 캐시 읽기는 호출에 포함하지
않으며, 실패한 HTTP 요청은 호출에 포함합니다.

`getChargerStatus`는 최근 10분 동안 상태가 갱신된 충전기 목록을 반환합니다.
따라서 `status.json`은 서울 모든 충전기의 상태 스냅샷이 아닙니다.
전체 충전기의 조회 시점 상태는 `stations.json`의 `stat` 등에도 포함됩니다.

모든 페이지 수신이 성공하면 임시 파일을 완성한 뒤 기존 파일을 교체합니다.
실패하면 기존 파일을 유지하고 종료 코드 1을 반환합니다.
스크립트의 동시 실행은 피해주세요.

출처: [한국환경공단_전기자동차 충전소 정보](https://www.data.go.kr/data/15076352/openapi.do)

## 3D 대시보드

```sh
npm install
npm run dev
```

브라우저에서 `http://127.0.0.1:5173`을 엽니다. `npm run dev`와 `npm run build`는
기존 로컬 데이터만 집계하며 공공데이터 API를 호출하지 않습니다.
API에서 갱신하려면 `python3 scripts/fetch_chargers.py`를 먼저 실행한 뒤
`npm run data`와 브라우저 새로고침을 실행합니다.

`data/dashboard.json`은 충전소별 압축 배열이며 원본 파일을 변경하지 않습니다.
`statId` + `chgerId`로 병합하고 `statUpdDt`가 더 최신인 상태만 반영합니다.
상태 코드는 2=충전대기, 3=충전중, 4/5=고장·점검, 1/9/기타=확인 불가로
분류합니다. 기둥 높이는 충전기 1대당 6m이며 네 상태의 개수만큼 구간을 쌓습니다.
통계는 전체 충전기를 포함하고, 좌표가 없거나 서울 범위 밖인 충전소는 지도에서
제외한 뒤 패널에 제외 개수를 표시합니다.

서버의 루트는 `web`입니다. 원본 JSON과 `.env`를 공개하지 않으며, 개발 서버는
`/data/dashboard.json`만 명시적으로 제공합니다. 배포 빌드에도 이 경량 데이터만
복사합니다. 브라우저에서 공공데이터 API를 호출하지 않습니다. 배경지도·폰트는
OpenFreeMap / Google Fonts에서 가져오므로 인터넷 연결이 필요합니다.

```sh
npm test
npm run build
npm run preview
```

시안/구현 기준은 `docs/design.md`에 있습니다.
