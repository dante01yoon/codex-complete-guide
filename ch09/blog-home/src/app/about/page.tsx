import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "소개",
  description: "개발을 공부하며 이해한 것과 직접 해 본 것을 차곡차곡 남기는 공간입니다.",
};

const topics = [
  { title: "프론트엔드", description: "React, TypeScript, CSS를 작은 예제로 익힙니다." },
  { title: "직접 해 본 기록", description: "구현 과정에서 만난 질문과 해결 방법을 남깁니다." },
  { title: "공부와 회고", description: "배운 내용을 다시 설명하고 다음 질문을 찾습니다." },
];

export default function AboutPage() {
  return (
    <main id="main" className="about-main reading-column">
      <section className="about-intro" aria-labelledby="about-title">
        <h1 id="about-title">배우고, 만들어 보고, 기록합니다.</h1>
        <div className="about-copy">
          <p>안녕하세요. 작은 배움을 코드로 옮기며 성장하는 개발자입니다.</p>
          <p>이곳은 개발을 공부하며 이해한 것과 직접 해 본 것을 차곡차곡 남기는 공간입니다.</p>
        </div>
      </section>

      <section className="about-section" aria-labelledby="topics-title">
        <h2 id="topics-title">이곳에서 다루는 이야기</h2>
        <ul className="about-topics">
          {topics.map((topic) => (
            <li key={topic.title}>
              <h3>{topic.title}</h3>
              <p className="summary">{topic.description}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="about-section" aria-labelledby="approach-title">
        <h2 id="approach-title">기록하는 방식</h2>
        <p className="about-copy">이해한 것, 직접 확인한 것, 아직 남은 질문을 구분해 적습니다. 완성된 답보다 배움의 과정을 오래 남기고 싶습니다.</p>
        <Link className="about-posts-link" href="/#posts">최근 글 읽기 <span aria-hidden="true">→</span></Link>
      </section>
    </main>
  );
}
