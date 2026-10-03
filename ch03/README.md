# 3장 코덱스 사용 요금과 사용량 알아보기

## 사용량 확인 명령

```text
/status   # 남은 주간·5시간 한도, 초기화 시점, 남은 크레딧
/usage    # 사용 기록(View analytics)과 한도 리셋(Redeem reset)
```

앱에서는 [Settings > Usage & billing]에서 확인합니다.

## 03.3 사용량 비교 실험

같은 질문을 모델·추론 수준·조건만 바꿔 실행하고 토큰 수를 기록했습니다.

```text
index.html에서 승리를 판정하는 방법을 세 문장으로 설명해줘. 파일은 수정하지 말아줘.
```

```sh
codex exec --json -s read-only -m gpt-6-luna -c model_reasoning_effort=low "index.html에서 승리를 판정하는 방법을 세 문장으로 설명해줘. 파일은 수정하지 말아줘."
codex exec --json -s read-only -m gpt-6.1-sol -c model_reasoning_effort=low "..."
codex exec --json -s read-only -m gpt-6.1-sol -c model_reasoning_effort=xhigh "..."
codex exec --json -s read-only -m gpt-6-astra -c model_reasoning_effort=high "..."
```

`turn.completed` 줄의 `usage`에 입력·캐시·출력 토큰이 표시됩니다.

## 03.4 API 키로 로그인

```sh
export OPENAI_API_KEY="여기에-발급받은-키"
printenv OPENAI_API_KEY | codex login --with-api-key
codex login status
```

API 키를 저장소에 올리지 마세요.
