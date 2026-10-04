import Link from "next/link";
import { notFound } from "next/navigation";
import { Button } from "@/components/ui/button";
import { posts, formatDate } from "@/data/posts";

function renderParagraph(paragraph: string) {
  return paragraph.split(/(https?:\/\/[^\s]+)/g).map((part, index) =>
    part.startsWith("http") ? <a key={`${part}-${index}`} href={part} target="_blank" rel="noreferrer">{part}</a> : part,
  );
}

export function generateStaticParams() { return posts.map(({ slug }) => ({ slug })); }
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return { title: posts.find((post) => post.slug === slug)?.title ?? "글을 찾을 수 없습니다" };
}
export default async function PostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = posts.find((item) => item.slug === slug);
  if (!post) notFound();
  return <main id="main" className="reading-column post-page"><Button variant="outline" nativeButton={false} render={<Link href="/#posts" />}>글 목록으로</Button><article><h1>{post.title}</h1><p className="metadata"><time dateTime={post.date}>{formatDate(post.date)}</time> · {post.readingMinutes}분 읽기</p><div className="post-body">{post.content.map((paragraph) => <p key={paragraph}>{renderParagraph(paragraph)}</p>)}</div></article></main>;
}
