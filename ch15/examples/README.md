# 15장 이론 절 예시

15장을 마친 `ev-booking`(이 저장소의 `ch15/ev-booking`)에서 실행합니다.

| 파일 | 절 | 쓰는 법 |
|---|---|---|
| `loop-min.sh` | 15.4 | `tests/rules/format.test.ts`를 넣고 커밋한 뒤 `scripts/loop-min.sh "src/rules/format.ts에 formatWon을 만들어 tests/rules/format.test.ts를 통과시켜 줘."` |
| `format.test.ts` | 15.4 | 사람이 먼저 쓴 테스트. `tests/rules/`에 둡니다 |
| `notice.test.ts` | 15.6 | 사람이 먼저 쓴 테스트. `tests/rules/`에 둡니다 |
| `compare.sh` | 15.6 | `git worktree add`로 만든 두 복사본에서 같은 요청을 돌린 뒤 `scripts/compare.sh ../best-demo-a ../best-demo-b` |

- 스크립트에서 `codex exec`를 부를 때는 `< /dev/null`을 붙입니다. 붙이지 않으면 추가 입력을 기다리며 멈출 수 있습니다.
- `compare.sh`는 각 복사본의 테스트 결과, `main`과 비교한 `src` 변경 줄 수, `src/rules/notice.ts`가 `refund.ts`의 함수를 재사용했는지를 보여 줍니다.
