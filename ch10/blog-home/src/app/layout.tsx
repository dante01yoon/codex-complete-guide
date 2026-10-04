import type { Metadata } from "next";
import localFont from "next/font/local";
import Link from "next/link";
import { ThemePicker } from "@/components/theme-picker";
import { Separator } from "@/components/ui/separator";
import "./globals.css";

const pretendard = localFont({
  src: "../../public/fonts/PretendardVariable.woff2",
  variable: "--font-pretendard", weight: "100 900", display: "swap",
});
export const metadata: Metadata = {
  title: { default: "Study Journal · 개발 공부 기록", template: "%s · Study Journal" },
  description: "배우고, 만들어 보고, 기록하는 개발 공부 노트.",
};
const themeScript = `(function(){var t='system';try{var s=localStorage.getItem('journal-theme');if(['system','light','dark'].includes(s))t=s}catch(e){}document.documentElement.dataset.theme=t;document.documentElement.classList.toggle('dark',t==='dark'||(t==='system'&&matchMedia('(prefers-color-scheme: dark)').matches))})()`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" className={pretendard.variable} suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: themeScript }} /></head>
      <body>
        <a href="#main" className="skip-link">본문 바로가기</a>
        <div className="site-shell">
          <header className="site-header">
            <Link href="/" className="wordmark">Study Journal<span className="wordmark-dot" aria-hidden="true">.</span></Link>
            <div className="header-controls">
              <nav aria-label="주 메뉴"><Link href="/#posts">글</Link><Link href="/#about">소개</Link></nav>
              <ThemePicker />
            </div>
          </header>
          {children}
          <footer className="site-footer">
            <Separator />
            <div className="footer-content"><p>© 2026 Study Journal</p><p>배움의 과정을 차곡차곡 기록합니다.</p></div>
          </footer>
        </div>
      </body>
    </html>
  );
}
