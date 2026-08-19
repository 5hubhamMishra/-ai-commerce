import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Business Dashboard",
  // Not linked from any public page and disallowed in robots.ts — this
  // metadata-level noindex is the authoritative, more-reliable signal on
  // top of that (robots.txt only asks crawlers not to fetch; noindex is
  // what actually keeps an already-discovered URL out of an index).
  robots: { index: false, follow: false },
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
