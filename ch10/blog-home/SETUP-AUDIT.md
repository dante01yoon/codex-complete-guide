# 프로젝트 준비 및 스킬 점검 기록

점검일: 2026-10-04. 범위: 프로젝트 초기화와 두 스킬 설치. 블로그 화면 구현은 하지 않았으며 Next.js 빈 템플릿의 `Hello world!`만 유지했다.

## 설치

- Next.js 16.3.8 / App Router / TypeScript / Tailwind CSS v4 / npm / `src/` / `@/*`.
- `npx --yes create-next-app@latest . --ts --tailwind --eslint --app --src-dir --import-alias '@/*' --use-npm --empty --disable-git --yes`
- `npx --yes shadcn@latest init --defaults --no-monorepo --yes`: base-nova, neutral, Lucide, CSS variables. 초기화가 기본 Button과 utils를 생성했다. 페이지에서 사용하지 않는다.
- `DISABLE_TELEMETRY=1 DO_NOT_TRACK=1 npx --yes skills add shadcn/ui --skill shadcn --agent codex --yes`
- UI UX Pro Max: skill-installer의 GitHub 설치 스크립트로 아래 커밋의 `.claude/skills/ui-ux-pro-max`만 `.agents/skills`에 설치했다. SKILL.md는 같은 커밋의 공식 Codex 템플릿과 렌더링 규칙으로 생성해 `.agents/skills/ui-ux-pro-max/scripts/search.py` 경로를 적용했다. 기본 uipro 설치기는 추가 스킬 6개도 설치하므로 실행하지 않았다.

## 설치 전 정적 점검

원본 저장소를 프로젝트 밖 임시 폴더에 받아 확인했다. SKILL.md, UI UX Pro Max의 Codex SKILL.md 생성 템플릿과 quick-reference, scripts의 import와 함수 호출, 파일 I/O 및 삭제 경로를 확인했다. 설치 후 스킬 파일을 점검한 원본과 바이트 단위로 대조했다. UI UX Pro Max의 SKILL.md만 공식 Codex 템플릿 렌더링 결과로 다르다.

### shadcn

- 원본: https://github.com/shadcn-ui/ui/tree/295a1f114a138f23b5dfee0e0c6812394dfeb90c/skills/shadcn
- 공식 설치 문서: https://ui.shadcn.com/docs/skills
- `scripts/` 폴더 없음. SKILL.md에 파일 삭제 명령 없음.
- SKILL.md는 `npx shadcn@latest info --json`, docs/search/view/add 등의 CLI 실행을 안내한다. npm 및 외부 컴포넌트/문서 레지스트리 접속을 포함한다. 프로젝트 내용이나 비밀을 업로드하는 명령은 발견하지 못했다.
- add/init/apply는 파일과 의존성을 변경할 수 있다. 네트워크 접속이 없는 스킬로 분류할 수는 없다.
- skills 설치 CLI는 별도의 텔레메트리 기능이 있어 실제 설치와 목록 확인 시 비활성화했다.

### UI UX Pro Max

- 원본: https://github.com/nextlevelbuilder/ui-ux-pro-max-skill/tree/477bcb28c9812b385cb51a4605ddf30d7b2266e2
- 런타임 스크립트 5개는 로컬 CSV/JSON을 읽는 Python 표준 라이브러리 코드다. HTTP 요청, 소켓, 외부 데이터 업로드 코드는 발견하지 못했다. `urllib.parse`는 URL 문자열 검사에 사용하며 네트워크 요청이 아니다.
- **삭제 코드 있음:** `scripts/design_system.py:1017`의 `os.unlink(temp_name)`은 `_write_persisted_file`이 직접 생성한 임시 파일을 정리한다. 테스트의 `TemporaryDirectory`도 자신이 만든 임시 폴더를 정리한다.
- `--persist`는 디자인 문서를 로컬에 저장하고, `--force`는 `os.replace`로 기존 문서를 덮어쓸 수 있다. SKILL.md는 명시적 사용자 승인 없이 force를 사용하지 않도록 안내한다. 이번 작업에서는 둘 다 실행하지 않았다.
- 테스트에 subprocess 호출이 있으나 로컬 Python 검색/검증 스크립트를 실행하는 용도다. 일부 테스트는 원본 저장소의 유지보수 스크립트와 fixtures를 요구하므로 프로젝트에 복사된 테스트 전체는 실행하지 않았다.
- 일반 프로젝트 파일을 일괄 삭제하거나 외부로 전송하는 명령은 발견하지 못했다.

이 결과는 점검한 커밋과 파일에 대한 정적 검토다. 향후 `@latest` CLI 실행이나 스킬 업데이트로 가져오는 코드까지 보증하지 않는다.

## 검증

- PASS: `npx skills list --agent codex`에 shadcn, ui-ux-pro-max 두 개 표시.
- PASS: 설치된 파일과 점검 원본 대조; 공식 Codex 템플릿 렌더링 및 경로 확인.
- PASS: `python3 .agents/skills/ui-ux-pro-max/scripts/search.py --help`.
- PASS: `npm run lint`.
- PASS: `npx tsc --noEmit`.
- PASS: `NEXT_TELEMETRY_DISABLED=1 npm run build` (정적 `/` 및 `/_not-found` 생성).
- NOT_RUN: 브라우저 UI 검사, 실제 디자인 요청에 대한 스킬 자동 실행.
- FAIL: 최종 npm audit는 high 9개를 보고했다. 대상 패키지는 @next/eslint-plugin-next, @shadcn/registry, @ts-morph/common, braces, eslint-config-next, fast-glob, micromatch, shadcn, ts-morph다. 동일한 braces 취약점이 여러 상위 패키지에 전파된 집계이며 9개의 독립 취약점이라는 뜻은 아니다. `--omit=dev` 검사에도 shadcn CLI 계열 high 7개가 보고됐다. 자동 수정안은 shadcn 1.0.0 및 eslint-config-next 14.2.35로의 주요 버전 다운그레이드를 포함하므로 적용하지 않았다.

스킬은 다음 턴부터 프로젝트 스킬로 사용할 수 있다. 자동 실행 여부 자체는 이번 작업에서 검증하지 않았다.
