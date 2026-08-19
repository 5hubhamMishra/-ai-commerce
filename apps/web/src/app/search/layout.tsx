import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Search",
  description: "Search Veloura's catalog in plain language — describe a budget, a use case, or a category and find what fits.",
  // Every result set is query-driven and session-specific — no single
  // stable canonical result to index.
  robots: { index: false, follow: true },
};

export default function SearchLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
