# 7장 스킬과 플러그인으로 코덱스 확장하기

『코덱스 완벽 가이드』 7장 실습 자료입니다. 챗GPT 앱(macOS, Codex CLI 0.160.0 내장)과 GPT-6.1-Sol(medium)로 진행했습니다. 작성 기준일은 2026년 10월 3일입니다.

| 폴더·파일 | 내용 |
|---|---|
| `skills/prompt-refiner/` | [실습 07]에서 스킬 크리에이터로 만든 스킬 |
| `plugins/prompt-kit/` | 07.6에서 Plugin Creator로 prompt-refiner를 묶은 플러그인 |
| `.agents/plugins/marketplace.json` | prompt-kit을 설치할 수 있는 마켓플레이스 파일 |

## [실습 07] prompt-refiner 스킬

5장 '05.4 메타 프롬프트로 요청 다듬기'의 메타 프롬프트를 스킬로 만든 것입니다. 하고 싶은 일을 말하면 바로 구현하지 않고, 프로젝트의 실제 파일을 읽은 뒤 목표·맥락·제약 조건·완료 기준으로 정리한 프롬프트를 써 줍니다.

### 바로 써 보기

개인 스킬 폴더에 복사하면 모든 프로젝트에서 쓸 수 있습니다.

```sh
mkdir -p ~/.agents/skills
cp -R skills/prompt-refiner ~/.agents/skills/
```

새 채팅을 열고 입력창에 `$prompt`를 입력해 `prompt-refiner`를 고른 뒤 하고 싶은 일을 적습니다.

```text
$prompt-refiner 히트맵에서 지난달, 다음 달로 넘겨 가며 볼 수 있게 하고 싶어.
```

### 책에서 사용한 프롬프트

입력창에서 `$skill`을 입력해 Skill Creator를 고른 뒤 보냈습니다.

```text
5장에서 쓴 메타 프롬프트를 스킬로 만들어줘. 이름은 prompt-refiner이고 개인 스킬 폴더(~/.agents/skills)에 만들어. 하는 일: 내가 하고 싶은 일을 말하면 바로 구현하지 않고, 프로젝트의 실제 파일을 읽은 뒤 목표·맥락·제약 조건·완료 기준 네 가지로 정리한 프롬프트를 써 준다. 내가 정해야 할 것은 추천안과 함께 질문으로 적는다. 프롬프트를 다듬거나 요청을 구체화해 달라고 할 때만 쓰이도록 description을 써줘. 다 만들면 구조를 검증하고 만든 파일 구조를 보여줘.
메타 프롬프트 원문: "[하고 싶은 일]을 하고 싶어. 아직 만들지 말고, 코덱스에게 줄 좋은 프롬프트로 다듬어줘. 목표(무엇을 왜 바꾸는지), 맥락(관련 파일과 각 파일의 역할, 실제 파일을 읽고 적기), 제약 조건(바꾸면 안 되는 것과 지켜야 할 규칙), 완료 기준(무엇을 어떻게 확인하면 끝인지). 내가 정해야 할 것이 있으면 추천안과 함께 질문으로 적어줘."
```

## 07.6 prompt-kit 플러그인

### 마켓플레이스로 설치하기

저장소를 받지 않고 GitHub에서 바로 추가할 수 있습니다. 저장소 맨 위의 `.agents/plugins/marketplace.json`에 prompt-kit을 등록해 두었습니다(책 [그림 07-14]).

```sh
codex plugin marketplace add dante01yoon/codex-complete-guide
codex plugin add prompt-kit@codex-complete-guide
codex plugin marketplace upgrade codex-complete-guide
```

저장소를 받아 `ch07` 폴더만 마켓플레이스로 추가해도 됩니다.

이 저장소를 받은 뒤 `ch07` 폴더를 마켓플레이스로 추가합니다.

```sh
git clone https://github.com/dante01yoon/codex-complete-guide.git
codex plugin marketplace add ./codex-complete-guide/ch07
codex plugin list --marketplace codex-complete-guide-ch07
```

챗GPT 앱의 [Plugins] 디렉터리에서 [Personal] 탭을 열면 '프롬프트 키트'가 보입니다. [+]를 눌러 설치하고, 새 채팅에서 `@`로 부르거나 `$prompt-refiner`를 씁니다.

필요 없어지면 다음 명령으로 마켓플레이스를 지웁니다.

```sh
codex plugin marketplace remove codex-complete-guide-ch07
```

### 책에서 사용한 프롬프트

[Settings > Plugins]의 [Add > Create plugin]으로 Plugin Creator를 설치한 뒤, 입력창에서 `@plugin`을 입력해 Plugin Creator를 골라 보냈습니다.

```text
개인 스킬 폴더의 prompt-refiner 스킬(~/.agents/skills/prompt-refiner)을 담은 플러그인을 만들어줘. 플러그인 이름은 prompt-kit이고, 개인 마켓플레이스에 등록해서 앱의 Personal 탭에서 보이게 해줘. 표시 이름은 '프롬프트 키트', 설명은 '요청을 목표·맥락·제약 조건·완료 기준으로 다듬는 도구 모음'으로 해줘. 원래 스킬 파일은 그대로 두고 플러그인 안에 복사해. 다 만들면 만든 파일 구조와 plugin.json 내용을 보여줘.
```

책에서는 개인 마켓플레이스(`~/.agents/plugins/marketplace.json`)에 등록했습니다. 이 저장소에는 같은 플러그인을 저장소 마켓플레이스 형식(`.agents/plugins/marketplace.json`, 경로 `./plugins/prompt-kit`)으로 넣었습니다.

## 확인한 것

| 항목 | 상태 | 근거 |
|---|---|---|
| prompt-refiner 구조 검증 | PASS | Skill Creator의 `quick_validate.py` 결과 `Skill is valid!` |
| prompt-refiner 실제 호출 | PASS | 새 채팅에서 `$prompt-refiner`로 습관 트래커 요청을 다듬음(파일 수정 없음) |
| prompt-kit 개인 마켓플레이스 등록·설치 | PASS | 앱 [Personal] 탭에서 설치 완료 알림 확인 |
| 이 폴더를 마켓플레이스로 추가 | PASS | `codex plugin marketplace add ./ch07` 후 `prompt-kit@codex-complete-guide-ch07` 목록 확인 |

다른 사람이 만든 스킬이나 플러그인을 설치할 때는 먼저 `SKILL.md`와 스크립트를 읽어 보세요. 이 폴더의 스킬에는 스크립트가 없습니다.
