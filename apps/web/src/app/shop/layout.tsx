import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Shop All Products",
  description: "Browse Veloura's full electronics catalog — laptops, headphones, smartphones, gaming gear, wearables, cameras, home audio, and accessories.",
  alternates: { canonical: "/shop" },
};

export default function ShopLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
