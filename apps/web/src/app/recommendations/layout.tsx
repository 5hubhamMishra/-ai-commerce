import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Recommended For You",
  description: "Personalized picks based on your recent browsing, wishlist, and cart activity.",
  // Content is session-personalized, not a stable page to index.
  robots: { index: false, follow: true },
};

export default function RecommendationsLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
