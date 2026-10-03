# 6장 MCP 서버 연결 실습

MCP(Model Context Protocol)는 코덱스가 외부 서비스의 도구와 자료를 사용할 수 있도록 연결하는 규약입니다. 이 장에서는 문서 검색, 브라우저 조작, GitHub 저장소 작업에 필요한 서버를 연결했습니다.

챗GPT 앱(macOS)의 코덱스에서 진행한 실습 기록입니다. 작성 기준일은 2026년 10월 3일입니다.

## 연결한 MCP 서버

아래 목록은 이 장에서 연결한 서버입니다. GitHub는 앱의 GitHub 플러그인을 통해 사용했습니다.

| 서버·서비스 이름 | 용도 | 활용 예시 |
|---|---|---|
| `GitHub` | 저장소, 커밋, 이슈, PR 조회와 변경 | 기본 브랜치와 최근 커밋 조회, 실습 자료를 브랜치에 저장하고 PR 생성 |
| `openaiDeveloperDocs` | 오픈AI 공식 개발자 문서 검색과 본문 조회 | 코덱스와 MCP 사용 방법을 공식 문서에서 확인 |
| `context7` | 라이브러리·프레임워크 문서 검색 | 사용하는 라이브러리의 문서를 찾아 코드 작성에 참고 |
| `playwright` | 브라우저 탐색과 화면 조작 | 웹 페이지를 열고 클릭·입력 등 사용자 동작 확인 |

## GitHub 연결 방법

이번 실습은 챗GPT 앱의 GitHub 플러그인을 사용하는 방식입니다. 서버 주소나 토큰을 직접 설정하는 방식과는 설정 절차가 다를 수 있습니다.

1. 앱에서 [Plugins]를 열고 `GitHub`를 검색합니다.
2. GitHub 플러그인의 상세 화면을 열어 설치합니다.
3. 연결 안내에 따라 GitHub 계정으로 로그인하고, 요청된 권한을 확인해 연결을 승인합니다. 인증 안내는 설치 중 또는 처음 사용할 때 나타날 수 있습니다.
4. GitHub의 연결·설치 권한 화면에서 실습할 저장소에 접근할 수 있도록 허용합니다. 이 실습에서는 `dante01yoon/codex-complete-guide`를 사용합니다.
5. 새 코덱스 대화를 시작합니다. 입력창에서 `@`를 입력하고 GitHub 플러그인을 선택한 뒤 조회를 요청합니다.

플러그인을 설치했어도 계정 인증이나 저장소 접근 권한이 없으면 도구를 사용할 수 없습니다. 저장소가 조회되지 않으면 연결한 계정과 허용한 저장소를 먼저 확인해 보세요. 메뉴와 인증 화면은 앱 버전이나 계정 환경에 따라 달라질 수 있습니다.

플러그인의 설치, 추가 인증, 새 대화 시작, `@` 선택 절차는 [오픈AI 공식 플러그인 안내](https://learn.chatgpt.com/docs/plugins#use-and-install-plugins)에서 확인할 수 있습니다.

## 연결 확인: 저장소를 조회해 보기

먼저 자료를 읽는 요청으로 연결 상태를 확인했습니다. 입력창에서 GitHub 플러그인을 선택하고 다음과 같이 요청했습니다.

```text
GitHub로 dante01yoon/codex-complete-guide 저장소의 기본 브랜치와 최근 커밋 3개를 알려줘. 아무것도 수정하지 마.
```

실제로 조회한 기본 브랜치는 `main`이었습니다. 조회 당시 최근 커밋은 아래와 같습니다. 이후 커밋이 추가되면 결과가 달라집니다.

| 커밋 | 메시지 |
|---|---|
| [ffa7ea3](https://github.com/dante01yoon/codex-complete-guide/commit/ffa7ea3f31e61581ab50042d20a39ac01f09bc91) | Use home-relative paths in ch05 notes |
| [9d7ebe4](https://github.com/dante01yoon/codex-complete-guide/commit/9d7ebe47e0d6c3e43bc86e2e801a7a25ee5f85db) | Add chapter 5 materials |
| [ceddb6c](https://github.com/dante01yoon/codex-complete-guide/commit/ceddb6c0ebac639a7e2751b1b3a286fb181df458) | Add chapter 4 advanced CLI materials |

## 저장 실습: 확인을 받은 뒤 브랜치와 PR 만들기

자료를 저장할 때는 만들 파일과 브랜치, 커밋 메시지를 먼저 확인했습니다.

```text
ch06 폴더에 README.md를 만들어서 이 장에서 연결한 MCP 서버 목록과 GitHub 연결 방법을 한국어로 정리해줘.
저장하기 전에 만들 파일 경로, 브랜치, 커밋 메시지를 먼저 보여 주고 내 확인을 받아줘.
```

확인한 작업 범위는 다음과 같습니다.

| 항목 | 값 |
|---|---|
| 파일 | `ch06/README.md` |
| 작업 브랜치 | `codex/ch06-mcp-notes` |
| 커밋 메시지 | `Add chapter 6 MCP setup notes` |
| PR 대상 브랜치 | `main` |

사용자가 위 내용을 승인하고 PR 생성까지 요청한 뒤 파일 작성과 저장을 진행합니다. 파일 작성·커밋·푸시는 로컬 Git으로 진행하고, PR은 GitHub 플러그인으로 만듭니다. PR은 변경 내용을 검토할 수 있도록 올리는 요청이며, `main`에 반영하려면 별도로 병합해야 합니다.

## 확인 범위

서버 연결 목록과 실제 도구 실행 결과를 구분해 기록합니다.

| 항목 | 상태 | 근거 |
|---|---|---|
| GitHub 기본 브랜치·최근 커밋 조회 | PASS | GitHub 플러그인으로 저장소 메타데이터와 커밋 3개 조회 |
| `openaiDeveloperDocs` 문서 검색·본문 조회 | PASS | 공식 플러그인 안내를 검색하고 본문 조회 |
| `context7` 도구 실행 | NOT_RUN | 연결 목록에 포함되지만 이번 README 작성에서는 호출하지 않음 |
| `playwright` 브라우저 동작 확인 | NOT_RUN | 연결 목록에 포함되지만 이번 README 작성에서는 호출하지 않음 |

인증 정보, API 키, 개인 토큰은 이 실습 자료에 포함하지 않습니다.
