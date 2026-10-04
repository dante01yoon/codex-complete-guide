# 10장 나만의 웹사이트 디자인하고 배포하기

『코덱스 완벽 가이드』 10장 실습 자료입니다. 챗GPT 앱(macOS, Codex CLI 0.160.0 내장)과 GPT-6.1-Sol(medium)로 진행했습니다. 작성 기준일은 2026년 10월 4일입니다.

`blog-home/`은 [실습 08]에서 만든 블로그 홈입니다. Next.js 16, 타입스크립트, 테일윈드 v4, shadcn/ui로 만들었습니다.

| 파일 | 내용 |
|---|---|
| `blog-home/DESIGN.md` | UI UX Pro Max 스킬로 만든 디자인 기준(google-labs-code/design.md 형식) |
| `blog-home/SETUP-AUDIT.md` | 스킬 설치 전에 코덱스가 남긴 점검 기록 |
| `blog-home/src/data/posts.ts` | 예시 글 데이터(예약 작업이 추가한 글 포함) |
| `blog-home/src/app/about/page.tsx` | 10.3에서 Build Web Apps 플러그인으로 만든 소개 페이지(콘셉트 이미지 승인 후 구현) |
| `blog-home/src/components/site-nav.tsx` | 글·소개 링크가 있는 머리글 메뉴 |

## 실행 방법

```sh
cd blog-home
npm install
npm run dev
```

http://localhost:3000 에서 확인합니다. 디자인 스킬(`shadcn`, `ui-ux-pro-max`)은 저장소에 넣지 않았습니다. 책의 [실습 08] 02단계처럼 코덱스에게 설치를 요청하세요.

## 책에서 사용한 프롬프트

프로젝트 준비와 스킬 설치:

```text
이 폴더에 블로그 홈 페이지를 만들 준비를 해줘. 1) Next.js(App Router, 타입스크립트, 테일윈드)로 프로젝트를 만들고 shadcn/ui를 초기화해줘(npx shadcn@latest init). 2) 디자인용 스킬 두 개를 이 프로젝트의 .agents/skills에 설치해줘. 하나는 shadcn/ui 공식 스킬(npx skills add shadcn/ui), 다른 하나는 UI UX Pro Max 스킬(github.com/nextlevelbuilder/ui-ux-pro-max-skill)이야. 설치 전에 각 스킬의 SKILL.md와 scripts 폴더에서 외부로 데이터를 보내거나 파일을 지우는 명령이 없는지 확인하고 알려줘. 3) 마지막에 설치된 스킬 목록과 프로젝트 폴더 구조를 보여줘. 아직 화면은 만들지 마.
```

10.3 공식 플러그인 시연:

```text
@Build Web Apps 블로그에 소개 페이지(/about)를 새로 만들고 싶어. 먼저 Image Gen으로 콘셉트 이미지를 만들어 보여 주고, 내가 승인하기 전에는 코드를 수정하지 마. DESIGN.md의 색과 글꼴 규칙을 지켜 줘.
```

```text
좋아, 이 콘셉트로 승인할게. 그대로 구현하고 브라우저에서 콘셉트와 비교해서 확인해 줘. 헤더에 소개 링크도 연결해 줘.
```

```text
@Product Design 블로그 홈 화면(http://127.0.0.1:3000)을 감사(audit)해 줘. 코드는 수정하지 말고, 화면을 캡처한 근거와 함께 UX·디자인·접근성 문제를 우선순위별로 보고해 줘.
```

DESIGN.md 만들기, 화면 만들기, Vercel 배포, 챗GPT Sites 게시, 예약 작업 지시는 책 10장 본문을 참고하세요.

## 주의

- 배포한 사이트는 누구나 볼 수 있습니다. 개인 정보나 API 키가 들어 있지 않은지 확인하세요.
- 예약 작업은 쓰지 않을 때 지우세요. 실행할 때마다 사용량이 나갑니다.
