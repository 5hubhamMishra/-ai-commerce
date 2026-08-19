import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "ShopAI — Your Shopping Assistant",
  description: "Ask ShopAI in plain language and it searches Veloura's real catalog for you — it never invents a product, price, or spec.",
  alternates: { canonical: "/ai-shopping" },
};

export default function AiShoppingLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
