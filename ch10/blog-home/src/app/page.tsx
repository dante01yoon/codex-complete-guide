import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { posts, tags, formatDate } from "@/data/posts";

export default async function Home({ searchParams }: { searchParams: Promise<{ tag?: string }> }) {
  const { tag } = await searchParams;
  const selectedTag = tag && tags.includes(tag) ? tag : undefined;
  const visiblePosts = selectedTag ? posts.filter((post) => post.tags.includes(selectedTag)) : posts;
  return (
    <main id="main" className="home-main">
      <section id="about" className="intro reading-column" aria-labelledby="intro-title">
        <p className="eyebrow">개발 공부 노트</p>
        <h1 id="intro-title">배우고, 만들어 보고, 기록합니다.</h1>
        <p className="introduction">안녕하세요. 작은 배움을 코드로 옮기며 성장하는 개발자입니다.</p>
      </section>
      <section id="posts" className="reading-column" aria-labelledby="posts-title">
        <div className="section-heading"><h2 id="posts-title">{selectedTag ? `${selectedTag} 글` : "최근 글"}</h2><span className="metadata">{visiblePosts.length}개의 기록</span></div>
        <Separator />
        <div className="post-list">
          {visiblePosts.map((post) => (
            <article key={post.slug}>
              <Card>
                <CardHeader><CardTitle><h3><Link href={`/posts/${post.slug}`}>{post.title}</Link></h3></CardTitle><CardDescription>{post.summary}</CardDescription></CardHeader>
                <CardContent><div className="post-metadata"><time dateTime={post.date}>{formatDate(post.date)}</time><span aria-hidden="true">·</span><span>{post.readingMinutes}분 읽기</span></div></CardContent>
                <CardFooter><div className="tag-links">{post.tags.map((item) => <Badge key={item} variant="secondary" render={<Link href={`/?tag=${encodeURIComponent(item)}#posts`} />}>{item}</Badge>)}</div></CardFooter>
              </Card>
              <Separator />
            </article>
          ))}
        </div>
        {selectedTag && <Button variant="outline" nativeButton={false} render={<Link href="/#posts" />}>전체 글 보기</Button>}
      </section>
      <section id="tags" className="reading-column tag-section" aria-labelledby="tags-title">
        <h2 id="tags-title">태그로 둘러보기</h2>
        <p className="summary">관심 있는 주제의 기록을 모아 보세요.</p>
        <div className="tag-links">{tags.map((item) => <Badge key={item} variant="secondary" render={<Link href={`/?tag=${encodeURIComponent(item)}#posts`} />} aria-current={selectedTag === item ? "page" : undefined}>{item}<span aria-hidden="true">{posts.filter((post) => post.tags.includes(item)).length}</span></Badge>)}</div>
      </section>
    </main>
  );
}
