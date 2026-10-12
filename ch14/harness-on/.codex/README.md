# 로컬 하네스

`hooks.json`은 `UserPromptSubmit`·`PreToolUse`에 `guard.sh`, `Stop`에
`verify.sh`를 연결한다. 훅 신뢰는 사용자가 검토 후 설정한다.
스크립트 작성과 직접 실행 검증은 실제 훅 활성화 검증과 구분한다.
입출력 규약: [공식 OpenAI Hooks 문서](https://learn.chatgpt.com/docs/hooks).

## guard.sh

- 표준 입력: 훅 JSON 또는 명령·패치 원문. 입력을 실행하지 않는다.
- 통과는 종료 코드 `0`, 차단은 `2`. 입력 원문이나 키는 출력하지 않는다.
- JSON 디코딩 전후에 `live_`가 있으면 차단한다. 테스트용 `test_`는 허용한다.
- `tests/` 대상 추가·수정·삭제·이동 패치와 파일 쓰기 도구를 차단한다.
- 테스트 경로를 참조하는 셸 명령은 단순 조회·검증만 허용한다.
  `cat`, `head`, `tail`, `ls`, `wc`, `rg`, Git 조회, 테스트·타입 검사 실행은
  허용하며 리다이렉션·복합 명령·명령 치환·스냅샷 갱신은 차단한다.
- 상대·절대 경로, 명령의 `workdir`, 기존 심볼릭 링크를 검사한다.
- 복잡한 읽기 명령도 차단될 수 있다. 간단한 조회로 나눠 실행한다.

직접 확인 예 (실제 키가 아닌 가짜 값):

```sh
printf '%s' '{"tool_name":"Bash","tool_input":{"command":"cat tests/rules/refund.test.ts"}}' | .codex/guard.sh
printf '%s' '{"tool_name":"Bash","tool_input":{"command":"rm -rf tests/"}}' | .codex/guard.sh
printf '%s' '{"prompt":"live_sk_DUMMY_ONLY"}' | .codex/guard.sh
```

첫 줄은 `0`, 나머지는 `2`여야 한다. 명령은 실행되지 않는다.
이 검사는 입력 기반 보호 장치다. 인코딩된 스크립트·동적으로 조합한 경로·
경로를 숨긴 외부 프로그램까지 분석하는 파일시스템 샌드박스는 아니다.

## verify.sh

항상 저장소 루트에서 `npm run test:rules`와 `npm run typecheck`를 모두
실행한다. 첫 검사 실패가 두 번째 검사를 건너뛰게 하지 않는다.
검사 출력은 stderr로 보내고 stdout은 훅 JSON 전용으로 유지한다.
각 검사의 실행 제한은 120초, 훅 전체 제한은 300초다.

| 상황 | 동작 |
|---|---|
| 모두 통과 | `PASS`, 종료 코드 `0` |
| 첫 Stop에서 실패 | 종료 코드 `2`, 테스트를 변경하지 않고 구현을 한 번 수정하도록 요청 |
| 이어진 Stop에서 통과 | 다시 두 검사를 실행하고 `PASS` |
| 이어진 Stop에서도 실패 | `continue: false`로 자동 수정을 중단하고 `FAIL` 표시 |

재시도 여부는 Codex의 `stop_hook_active` 불리언을 사용한다. 별도 전역
카운터가 없으므로 다른 턴에 수정 횟수가 누적되지 않는다. 다른 Stop 훅이
이미 이어가기한 경우에도 이 플래그가 참이므로 추가 기회를 주지 않는다.
두 번째 실패의 종료 코드 `0`은 Stop JSON 전달 성공이며 검사 통과가 아니다.

수동 실행:

```sh
.codex/verify.sh </dev/null
# 실패하면 구현을 한 번 고친 뒤:
.codex/verify.sh --retry </dev/null
```

수동 첫 실패는 `2`, `--retry` 실패는 `1`이다. 수동 실행에서는 호출자가
수정 한 번 원칙을 지킨다. 자동 훅에서는 Stop 플래그로 추가 이어가기를 막는다.

## 직접 검증 기록

- 차단·허용 입력 및 재시도 모의 검증: `PASS`.
  테스트 조회·실행, 소스 패치, 테스트 파일 쓰기·삭제·이동,
  패치 추가·삭제·이름 변경, 경로 정규화·심볼릭 링크, 가짜 키·JSON 이스케이프,
  단독·동시 검사 실패, 수정 후 성공·실패를 확인했다.
- 실제 프로젝트: `npm run test:rules` 3개 파일·55개 테스트 `PASS`;
  `npm run typecheck` `PASS`.
- 테스트 파일·제품 코드는 변경하지 않았다.
- 신뢰 후 실제 훅 이벤트 연결: `NOT_RUN` (사용자의 신뢰 검토 후 확인).
- 브라우저·토스 테스트 실연결: `NOT_RUN` (이번 하네스 작업 범위 밖).
