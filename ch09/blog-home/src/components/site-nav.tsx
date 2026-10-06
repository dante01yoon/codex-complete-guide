"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function SiteNav() {
  const pathname = usePathname();
  const isAbout = pathname === "/about";

  return (
    <nav aria-label="주 메뉴">
      <Link href="/#posts" aria-current={!isAbout ? "page" : undefined}>글</Link>
      <Link href="/about" aria-current={isAbout ? "page" : undefined}>소개</Link>
    </nav>
  );
}
