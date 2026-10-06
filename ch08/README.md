# 8장 바이브 코딩과 에이전트 개발에 필요한 개발 지식

『코덱스 완벽 가이드』 8장 실습 자료입니다. 챗GPT 앱(macOS, Codex CLI 0.160.0 내장)과 GPT-6.1-Sol(medium)로 진행했습니다. 작성 기준일은 2026년 10월 4일입니다.

| 파일 | 내용 |
|---|---|
| `recommend.mjs` | 08.4 구조화된 출력 예제. 오픈라우터 모델에게 서울 도서관을 추천받아 `name`, `district`, `reason` 세 칸의 JSON으로 받습니다. |
| `package.json` | 예제에 필요한 패키지(`openai`, `zod`) |

## 실행 방법

1. 4장에서 발급한 오픈라우터 API 키를 이 폴더의 `.env.local`에 적습니다. 이 파일은 Git에 올리지 마세요.

   ```text
   OPENROUTER_API_KEY=발급받은-키
   ```

2. 패키지를 설치하고 실행합니다.

   ```sh
   npm install
   node recommend.mjs
   ```

## 08.3 API 요청 실습

키 없이 쓸 수 있는 Open-Meteo 날씨 API로 요청과 응답을 확인했습니다. 터미널에서도 같은 요청을 보낼 수 있습니다.

```sh
curl "https://api.open-meteo.com/v1/forecast?latitude=37.55&longitude=127.0&current=temperature_2m,wind_speed_10m"
```

구조화된 출력은 형식만 보장합니다. 책의 실습에서도 `district`에 자치구 대신 "서울"이 들어왔습니다. 실제 서비스에서는 믿을 수 있는 데이터를 도구로 붙여 내용을 검증하세요.
