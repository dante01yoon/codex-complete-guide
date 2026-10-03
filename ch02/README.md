# 2장 나에게 맞는 코덱스 작업 환경 설정하기

1장의 틱택토 게임이 있는 `codex-practice` 폴더에서 이어서 실습합니다.

## 설정 파일 예시 ([config](config/))

| 파일 | 복사할 위치 | 관련 절 |
|---|---|---|
| `user-config.toml` | `~/.codex/config.toml` | 02.1 사용자 설정 |
| `project/.codex/config.toml` | `codex-practice/.codex/config.toml` | 02.1 프로젝트 설정 |
| `fast.config.toml` | `~/.codex/fast.config.toml` | 02.1 프로필(`codex --profile fast`) |
| `permissions.toml` | `config.toml`에 내용 추가 | 02.6 권한 설정 |

설정이 겹칠 때 우선순위: 기본값 < 사용자 설정 < 프로필 < 프로젝트 설정 < 실행 옵션(`-c`, `-m`).
지금 적용된 설정 층은 코덱스에서 `/debug-config`로 확인할 수 있습니다.

## 절별 명령과 요청

### 02.1 설정 파일
```sh
codex --profile fast
codex -c model_reasoning_effort=low
codex -m gpt-6-astra
```

### 02.2 추론 수준 비교
```sh
codex -c model_reasoning_effort=low
codex -c model_reasoning_effort=xhigh
```
```text
index.html에서 승리를 판정하는 방법을 세 문장으로 설명해줘. 파일은 수정하지 말아줘.
```

### 02.4 웹 검색
```sh
codex --search
```
```text
npm에 배포된 @openai/codex 패키지의 최신 버전이 무엇인지 웹에서 찾아서 알려줘. 확인한 출처 링크도 함께 적어줘. 파일은 수정하지 말아줘.
```

### 02.5 멘션과 이미지
```text
@index.html 파일에서 [다시 시작] 버튼이 하는 일을 한 문장으로 설명해줘. 파일은 수정하지 말아줘.
```
[assets/win.png](assets/win.png)를 실습 폴더에 복사한 뒤 실행합니다. 요청을 `-i` 옵션 앞에 씁니다.
```sh
codex "이 스크린샷에서 누가 어떤 줄로 이겼는지, 승리한 칸이 어떻게 표시되는지 설명해줘. 파일은 수정하지 말아줘." -i win.png
```

### 02.6 권한
```text
문서 폴더(~/Documents)에 memo.txt 파일을 만들고 '권한 테스트'라고 한 줄 적어줘.
```
```sh
codex --sandbox read-only --ask-for-approval on-request
```

### 02.7 내장 브라우저로 결과 확인
```text
이 폴더에서 python3 -m http.server 8765 로 개발 서버를 실행하고, @Browser 로 http://localhost:8765/index.html 을 열어서 칸을 1 → 4 → 2 → 5 → 3 순서로 클릭해 X가 위쪽 가로줄로 이기는지 확인해줘. 칸 번호는 왼쪽 위부터 1~9번이야. 파일은 수정하지 말고, 확인이 끝나면 서버를 종료한 뒤 결과를 알려줘.
```
포트가 이미 쓰이고 있다면 다른 번호(예: 8790)로 바꿔 요청하세요.

### 02.8 IDE
```text
지금 열려 있는 파일에서 승리 조합을 정의한 코드를 찾아 몇 번째 줄인지와 하는 일을 짧게 설명해줘. 파일은 수정하지 말아줘.
```
```text
[다시 시작] 버튼의 글자를 '새 게임'으로 바꿔줘. 다른 부분은 수정하지 말아줘.
```
IDE의 [Undo]는 Git 저장소에서만 동작합니다.
