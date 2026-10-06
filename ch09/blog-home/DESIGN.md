---
version: alpha
name: Study Journal
description: 한국어 개발 공부 기록을 위한 차분하고 읽기 편한 개인 블로그
colors:
  primary: "#35624A"
  primary-hover: "#284D3A"
  on-primary: "#FFFFFF"
  background: "#F7F6F2"
  surface: "#FFFFFF"
  foreground: "#242824"
  secondary: "#626960"
  subtle: "#ECEFE8"
  border: "#D9DED5"
  control-border: "#858D82"
  focus: "#35624A"
  danger: "#A33C32"
  dark-primary: "#9AC7A5"
  dark-primary-hover: "#B6DABD"
  dark-on-primary: "#171B18"
  dark-background: "#171B18"
  dark-surface: "#202621"
  dark-foreground: "#E5E9E2"
  dark-secondary: "#ADB7AA"
  dark-subtle: "#2B342C"
  dark-border: "#3D483D"
  dark-control-border: "#778574"
  dark-focus: "#9AC7A5"
  dark-danger: "#F2A399"
typography:
  h1:
    fontFamily: Pretendard Variable
    fontSize: 36px
    fontWeight: 700
    lineHeight: 1.35
    letterSpacing: -0.02em
  h1-mobile:
    fontFamily: Pretendard Variable
    fontSize: 28px
    fontWeight: 700
    lineHeight: 1.4
    letterSpacing: -0.02em
  h2:
    fontFamily: Pretendard Variable
    fontSize: 24px
    fontWeight: 600
    lineHeight: 1.45
    letterSpacing: -0.01em
  post-title:
    fontFamily: Pretendard Variable
    fontSize: 22px
    fontWeight: 600
    lineHeight: 1.5
    letterSpacing: -0.01em
  post-title-mobile:
    fontFamily: Pretendard Variable
    fontSize: 20px
    fontWeight: 600
    lineHeight: 1.5
    letterSpacing: -0.01em
  body:
    fontFamily: Pretendard Variable
    fontSize: 18px
    fontWeight: 400
    lineHeight: 1.75
    letterSpacing: 0em
  summary:
    fontFamily: Pretendard Variable
    fontSize: 16px
    fontWeight: 400
    lineHeight: 1.7
    letterSpacing: 0em
  label:
    fontFamily: Pretendard Variable
    fontSize: 14px
    fontWeight: 500
    lineHeight: 1.5
    letterSpacing: 0em
  metadata:
    fontFamily: Pretendard Variable
    fontSize: 14px
    fontWeight: 400
    lineHeight: 1.6
    letterSpacing: 0em
  code:
    fontFamily: JetBrains Mono
    fontSize: 15px
    fontWeight: 400
    lineHeight: 1.7
    letterSpacing: 0em
rounded:
  sm: 4px
  md: 8px
spacing:
  xs: 4px
  sm: 8px
  md: 16px
  lg: 24px
  xl: 32px
  section: 48px
  section-desktop: 64px
  container: 960px
  reading: 680px
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.label}"
    rounded: "{rounded.sm}"
    padding: 12px 16px
  button-primary-hover:
    backgroundColor: "{colors.primary-hover}"
    textColor: "{colors.on-primary}"
  button-primary-dark:
    backgroundColor: "{colors.dark-primary}"
    textColor: "{colors.dark-on-primary}"
  button-primary-dark-hover:
    backgroundColor: "{colors.dark-primary-hover}"
    textColor: "{colors.dark-on-primary}"
  search-input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.foreground}"
    typography: "{typography.summary}"
    rounded: "{rounded.sm}"
    padding: 12px 16px
  search-input-dark:
    backgroundColor: "{colors.dark-surface}"
    textColor: "{colors.dark-foreground}"
  tag:
    backgroundColor: "{colors.subtle}"
    textColor: "{colors.secondary}"
    typography: "{typography.label}"
    rounded: "{rounded.sm}"
    padding: 4px 8px
  tag-dark:
    backgroundColor: "{colors.dark-subtle}"
    textColor: "{colors.dark-secondary}"
---

## Overview

**추천 방향: 종이 위에 차곡차곡 쌓이는 개발 학습 노트.** 한국어 독자가 최근 기록을 훑고 관심 있는 글을 읽도록, 글 제목·요약·날짜가 시각적 중심이 된다. 따뜻한 종이색, 먹색 글자, 절제된 녹색으로 차분한 인상을 만든다. 개인 블로그의 정체성은 짧은 소개와 실제 기록에서 드러낸다.

검토한 방향은 세 가지다. 이미지 중심 매거진은 시각적 개성이 강하지만 텍스트 기록을 탐색하는 데 썸네일이 방해될 수 있다. 조밀한 문서형 아카이브는 검색에 유리하지만 홈이 업무 도구처럼 느껴질 수 있다. **여백 있는 편집형 목록**은 최신 기록의 발견과 한국어 가독성을 함께 확보하므로 추천한다.

`ui-ux-pro-max` 검색에서 나온 Swiss Modernism 2.0의 정렬·간격·명확한 위계만 참고했다. 재검색에서도 스크롤 스토리텔링과 영문 중심 글꼴이 반환되어 이 부분은 제품에 맞는 검증된 추천으로 채택하지 않았다. 아래 색상·한국어 글꼴·목록 구성은 사용자의 요구와 스킬의 가독성 원칙을 바탕으로 별도 제안한 값이다.

이 문서는 디자인 제안이다. 홈 화면, 컴포넌트, 테마 동작을 아직 구현하지 않는다. 형식은 [google-labs-code/design.md 사양](https://github.com/google-labs-code/design.md/blob/main/docs/spec.md)의 YAML 토큰과 Markdown 설명 구조를 따른다.

## Colors

색은 역할에 연결한다. YAML의 기본 토큰은 라이트 모드이고, `dark-` 토큰은 같은 역할의 다크 모드 값이다. 구현 시 하나의 의미 토큰에 두 모드를 매핑한다. 컴포넌트마다 임의의 hex를 추가하지 않는다.

| 역할 | Light | Dark | 적용 |
|---|---|---|---|
| Background | `#F7F6F2` | `#171B18` | 페이지 바탕 |
| Surface | `#FFFFFF` | `#202621` | 입력창·열린 메뉴·코드 영역 |
| Foreground | `#242824` | `#E5E9E2` | 제목·본문·주요 아이콘 |
| Secondary | `#626960` | `#ADB7AA` | 요약·날짜·읽기 시간·placeholder |
| Primary | `#35624A` | `#9AC7A5` | 링크·선택 상태·주요 버튼 |
| Primary hover | `#284D3A` | `#B6DABD` | 링크 및 주요 버튼 hover·pressed |
| On primary | `#FFFFFF` | `#171B18` | 주요 버튼 안의 글자 |
| Subtle | `#ECEFE8` | `#2B342C` | 태그·목록 hover 바탕 |
| Border | `#D9DED5` | `#3D483D` | 장식적 구분선 |
| Control border | `#858D82` | `#778574` | 입력창·버튼의 식별에 필요한 경계 |
| Focus | `#35624A` | `#9AC7A5` | 키보드 포커스 링 |
| Danger | `#A33C32` | `#F2A399` | 오류 메시지; 원인과 복구 방법을 함께 표시 |

다크 모드는 색상을 반전하지 않고 녹색 기운의 짙은 중립색과 밝은 저채도 강조색을 사용한다. 최초 방문은 OS 설정을 따르고, 테마 선택은 **시스템 / 라이트 / 다크** 세 가지로 제공한다. 사용자의 명시 선택을 저장하고 이후 방문에도 유지한다. 첫 화면의 테마 깜빡임을 피한다.

계산 검증: WCAG 상대 휘도 식으로 불투명 hex 쌍을 계산했다. 아래 값은 토큰의 대비 결과이며 실제 화면의 접근성 검수 결과는 아니다.

| 조합 | Light 대비 | Dark 대비 |
|---|---:|---:|
| Foreground / Background | 13.83:1 | 14.16:1 |
| Secondary / Background | 5.24:1 | 8.40:1 |
| Secondary / Surface | 5.66:1 | 7.45:1 |
| Primary / Background | 6.48:1 | 9.19:1 |
| Primary / Surface | 7.01:1 | 8.15:1 |
| On primary / Primary | 7.01:1 | 9.19:1 |
| On primary / Primary hover | 9.49:1 | 11.40:1 |
| Control border / Surface | 3.43:1 | 3.96:1 |

일반 텍스트는 최소 4.5:1, 의미 있는 컨트롤 경계와 포커스는 최소 3:1을 유지한다. 장식적 Border는 입력창 식별이나 선택 상태의 유일한 단서로 사용하지 않는다.

## Typography

한국어 제목과 본문은 **Pretendard Variable**, 코드와 영문 식별자는 **JetBrains Mono**를 사용한다. [Pretendard 공식 저장소](https://github.com/orioncactus/pretendard)와 [JetBrains Mono 공식 저장소](https://github.com/JetBrains/JetBrainsMono)를 글꼴 출처로 삼는다. 영문 글꼴만 지정한 뒤 한글이 우연히 다른 글꼴로 표시되는 조합을 피한다.

기본 fallback: `"Pretendard Variable", Pretendard, "Noto Sans KR", "Apple SD Gothic Neo", "Malgun Gothic", sans-serif`. 코드 fallback: `"JetBrains Mono", "SFMono-Regular", Consolas, "Pretendard Variable", monospace`. 한글 주석은 한국어 글꼴로 대체될 수 있으므로 코드 칸 정렬을 한글 글자 폭에 의존하지 않는다.

| 역할 | 글꼴 | Desktop / Mobile 크기 | 굵기 | 행간 |
|---|---|---|---:|---:|
| 홈 제목 H1 | Pretendard Variable | 36px / 28px | 700 | 1.35 / 1.4 |
| 섹션 제목 H2 | Pretendard Variable | 24px / 24px | 600 | 1.45 |
| 글 제목 | Pretendard Variable | 22px / 20px | 600 | 1.5 |
| 긴 본문·소개 | Pretendard Variable | 18px / 18px | 400 | 1.75 |
| 글 요약·입력창 | Pretendard Variable | 16px / 16px | 400 | 1.7 |
| 탐색·버튼·태그 | Pretendard Variable | 14px / 14px | 500 | 1.5 |
| 날짜·읽기 시간 | Pretendard Variable | 14px / 14px | 400 | 1.6 |
| 코드 | JetBrains Mono | 15px / 15px | 400 | 1.7 |

크기는 기본 루트 16px 기준의 값이다. 구현할 때 rem으로 변환해 사용자 글자 크기 설정을 존중한다. 본문 자간은 0, 제목만 -0.01em~-0.02em을 사용한다. 한글은 어절 단위 줄바꿈을 우선하고 긴 URL·식별자에는 별도 줄바꿈 규칙을 적용한다. 제목은 말줄임 없이 자연스럽게 여러 줄로 표시한다. 날짜는 `2026.10.04`, 읽기 시간은 `5분 읽기`처럼 한국어 문맥에 맞춘다.

폰트는 필요한 글리프·굵기를 중심으로 로컬 제공하고 로딩 중에도 fallback으로 읽을 수 있어야 한다. 실제 파일 용량과 대체 글꼴의 줄바꿈을 확인하고, 폰트 로딩에 따른 위치 변화를 구현 단계에서 검수한다.

## Layout

- 홈 전체는 중앙 정렬, 최대 폭 **960px**. 글 목록과 소개의 읽기 열은 최대 **680px**이며 같은 왼쪽 기준선에 정렬한다. 넓은 화면에서도 글 목록은 한 열을 유지한다.
- **768px 미만:** 좌우 여백 20px, 상단·하단 여백 32px, 섹션 사이 48px. **768px 이상:** 좌우 여백 32px, 상단·하단 여백 48px, 섹션 사이 64px. 컨테이너는 가용 폭 안에서 유동적으로 줄어든다.
- 간격은 **4 / 8 / 16 / 24 / 32 / 48 / 64px**. 제목과 요약 8px, 요약과 메타데이터 12px(4px 단위 예외), 글 항목의 위아래 여백 각 24px.
- 순서: **헤더 → 짧은 소개 → 최근 글 제목과 검색·주제 필터 → 최신순 글 목록 → 페이지 탐색 → 푸터**. 소개는 2~3줄로 제한해 첫 화면에서 글 목록 시작이 보이도록 한다.
- 헤더는 이름·워드마크, `글 / 소개`, 테마 선택으로 구성한다. 모바일에서는 두 줄로 재배치하며 가로 스크롤을 만들지 않는다. 기본은 일반 문서 흐름의 헤더다.
- 한국어 본문은 데스크톱에서 대략 30~40자 폭을 출발점으로 실제 글로 조정한다. 영문 기준의 65~75자를 한글에 그대로 적용하지 않는다. 모바일은 글자 크기를 줄이지 않고 화면 폭에 맞춰 줄바꿈한다.
- 목록은 얇은 구분선과 여백으로 구획하고 기본 그림자는 없다. 입력창·메뉴는 4px, 코드 영역은 8px 모서리 반경을 사용한다. 둥근 대형 카드가 전체 구조를 지배하지 않게 한다.
- 375 / 768 / 1024 / 1440px, 가로 방향, 200% 확대에서 글·탐색 요소의 겹침과 가로 넘침을 구현 후 확인한다. 코드 블록에만 필요할 때 내부 가로 스크롤을 허용한다.

## Components

| 컴포넌트 | 시각 및 동작 규칙 |
|---|---|
| 헤더·탐색 | 이름 18px/600, 탐색 14px/500. 현재 위치는 녹색 글자와 밑줄로 표시. 홈 H1과 별개로 이름은 홈 링크다. |
| 소개 | H1 하나와 18px 본문. 학습 주제와 기록 목적을 짧게 전달. 거대한 광고형 히어로는 사용하지 않는다. |
| 글 목록 항목 | 제목 → 1~2문장 요약 → 날짜·읽기 시간·태그 순서. 최신순. 제목은 실제 링크, 태그 링크는 별도 요소로 두며 링크를 중첩하지 않는다. 요약은 저자가 짧게 작성하고 작은 화면에서는 자연스럽게 늘어난다. |
| 텍스트 링크 | 본문 링크는 항상 밑줄. 목록 제목은 Foreground, hover·focus 시 Primary와 밑줄. 색만으로 클릭 가능성을 표현하지 않는다. |
| 검색 | 항상 보이는 `글 검색` 라벨, 16px 입력 글자, 높이 최소 44px, Control border 1px, 모서리 4px. placeholder는 `제목이나 키워드 검색`. 입력을 지워 복구할 수 있게 한다. |
| 주제 필터·태그 | 필터는 버튼, 글의 주제 태그는 주제 페이지 링크. 필터는 여러 줄로 감싸고 선택 시 Primary 테두리와 체크·선택 상태를 함께 제공. 비대화형 태그에는 버튼처럼 보이는 hover를 넣지 않는다. |
| 버튼 | 필요할 때만 Primary 채움 버튼. 보조 버튼은 Surface 바탕·Foreground 글자·Control border 1px. 높이 최소 44px, 버튼 사이 8px 이상. 글 목록 탐색보다 버튼의 시각적 무게가 커지지 않게 한다. |
| 테마 선택 | `화면 테마`라는 접근 가능한 이름을 가진 선택 컨트롤. `시스템 / 라이트 / 다크`와 현재 선택을 표시. 아이콘만으로 모드를 구분하지 않는다. |
| 페이지 탐색 | 목록 아래 `이전 / 다음`과 현재 페이지. 작동 불가 항목은 의미적으로 비활성화. 필터·검색 상태를 보존. 무한 스크롤 대신 독자가 위치를 파악할 수 있는 탐색을 우선한다. |
| 빈 상태·오류 | 검색 결과가 없으면 `검색 결과가 없습니다`와 `검색 초기화`. 글이 없으면 `첫 기록을 준비하고 있습니다`. 오류는 메시지와 다시 시도 동작을 제공하고 Danger 색만으로 전달하지 않는다. |
| 코드 미리보기 | 필요한 글에서만 사용. Surface 바탕, Foreground 코드, 8px 반경, 16px 패딩. 홈에 장식용 터미널을 배치하지 않는다. |
| 푸터 | 14px Secondary, 상단 구분선, 32px 위 여백. 저자·RSS·GitHub처럼 실제로 제공하는 정보와 링크만 표시. |

공통 상태: 포커스 링은 **2px 실선 Focus + 3px 바깥 여백**. hover 배경은 Subtle, pressed는 Primary hover 또는 같은 색의 테두리 강조를 사용한다. disabled는 Secondary 글자와 Subtle 바탕, 동작 금지 및 의미 상태를 함께 적용하며 투명도로 글자를 흐리지 않는다.

대화형 컨트롤은 최소 **44×44 CSS px**의 영역을 확보한다(본문 인라인 링크 제외). 아이콘이 필요하면 프로젝트에 있는 **Lucide**의 선형 SVG를 **18px 또는 20px, stroke 1.75px**로 통일한다. 텍스트 옆 장식 아이콘은 스크린리더에서 숨기고 아이콘 버튼에는 이름을 제공한다.

모션은 hover·pressed 색상 변화 **120ms ease-out**, 메뉴 표시 **160ms ease-out** 정도만 허용한다. 포커스는 즉시 표시하며 글은 애니메이션 완료를 기다리지 않고 읽을 수 있어야 한다. `prefers-reduced-motion`에서는 전환을 제거한다. 스크롤 등장·패럴랙스·카드 확대는 사용하지 않는다.

## Do's and Don'ts

### Do's

- 실제 글 제목과 한국어 문단으로 길이·줄바꿈·정보 위계를 판단한다.
- 제목, 요약, 날짜를 먼저 읽게 하고 여백과 굵기로 중요도를 구분한다.
- 라이트·다크의 색 역할을 일치시키고 모든 상태의 대비를 각각 확인한다.
- 키보드 탐색, 본문 바로가기, 순서 있는 제목 구조, 명확한 링크 이름을 제공한다.
- 글자 확대와 줄바꿈을 허용하고 검색·필터·테마 선택을 키보드로 사용할 수 있게 한다.
- 구현 후 대비, 작은 화면, 확대, reduced motion, 폰트 로딩을 검수한다. 현재 검증은 토큰 대비 계산에 한정된다.

### Don'ts

- **보라·파랑 그라데이션, 오로라 배경, 빛나는 테두리, 네온 포인트**로 흔한 AI 서비스 분위기를 만들지 않는다.
- **반투명 유리 카드, 과도한 blur, 떠다니는 구체, 무의미한 3D 장식, bento 카드의 반복**을 사용하지 않는다.
- 모든 글에 획일적인 AI 생성 썸네일을 붙이거나 필요 없는 이미지를 넣지 않는다.
- 전체 화면을 차지하는 히어로, 그라데이션 제목, 과장된 홍보 문구로 최신 글을 아래로 밀지 않는다.
- 보조 정보를 저대비 회색·12px 이하 글자에 숨기지 않는다. 흰색·검은색으로 테마를 단순 반전하지 않는다.
- 한글 본문에 영문 장식 서체, 과도한 음수 자간, 양쪽 정렬, 강제 글자 단위 줄바꿈을 적용하지 않는다.
- 긴 제목을 한 줄 말줄임으로 잘라 내용을 숨기거나 좁은 화면에서 글자를 축소하지 않는다.
- hover에만 필요한 기능을 숨기거나, 포커스 링을 제거하거나, 색상만으로 선택·오류를 표현하지 않는다.
- 이모지를 탐색 아이콘으로 쓰거나, 아이콘 스타일·모서리 반경·그림자를 임의로 섞지 않는다.
- 자동 캐러셀, 읽기를 방해하는 등장 효과, 커서 추적 효과, 스크롤 강제 제어를 넣지 않는다.
- 글 목록과 경쟁하는 구독 팝업·상시 떠 있는 CTA·불필요한 통계 카드를 배치하지 않는다.
