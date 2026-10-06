# 11장 오픈 API와 웹 크롤링으로 외부 데이터 활용하기

『코덱스 완벽 가이드』 11장 실습 자료입니다. 챗GPT 앱(macOS, Codex CLI 0.160.0 내장)과 GPT-6.1-Sol(medium)로 진행했습니다. 작성 기준일은 2026년 10월 5일입니다.

| 폴더 | 내용 |
|---|---|
| `ev-map/` | [실습 11] 서울 전기차 충전소 3D 대시보드. 공공데이터포털 수집 스크립트, 충전소 단위로 묶은 `data/dashboard.json`, MapLibre GL 화면 |
| `books-crawl/` | 11.2 크롤링 예제. books.toscrape.com 목록 수집(`scrape_books.py`)과 Playwright로 quotes.toscrape.com/js 수집(`scrape_quotes.py`) |

## ev-map 실행 방법

저장소에는 화면에 필요한 `data/dashboard.json`만 들어 있습니다. 인증키 없이도 바로 지도를 볼 수 있습니다.

```sh
cd ev-map
npm ci
npm run dev
```

최신 데이터로 다시 받으려면 공공데이터포털에서 [한국환경공단_전기자동차 충전소 정보](https://www.data.go.kr/data/15076352/openapi.do)를 활용신청하고, `.env.example`을 `.env`로 복사해 일반 인증키(Decoding)를 넣은 뒤 실행합니다.

```sh
python3 scripts/fetch_chargers.py
npm run data
```

`fetch_chargers.py`가 만드는 원본 파일(`data/stations.json`, `data/status.json`, 약 78MB)은 저장소에 올리지 않았습니다.

## books-crawl 실행 방법

```sh
cd books-crawl
python3 scrape_books.py
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt && playwright install chromium
python3 scrape_quotes.py
```

## 주의

- `.env`는 저장소에 올리지 마세요. 인증키를 채팅이나 코드에 직접 붙여 넣지 않습니다.
- 데이터 출처: 한국환경공단, 공공데이터포털(공공누리 제1유형). 데이터는 수집 시점(2026년 10월 5일)의 값입니다.
- 위치 정보를 이용한 서비스를 사업으로 운영하려면 위치기반서비스사업 신고가 필요할 수 있습니다. 이 실습은 내 컴퓨터에서 확인하는 데까지만 진행합니다.
- 크롤링 예제는 연습용으로 공개된 toscrape 사이트에서만 실행하세요. 요청 사이에 1초씩 쉽니다.
