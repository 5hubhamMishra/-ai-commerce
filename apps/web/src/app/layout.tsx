import type { Metadata } from "next";
import { Inter, Playfair_Display } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import "./globals.css";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const playfair = Playfair_Display({
  subsets: ["latin"],
  variable: "--font-playfair",
  style: ["normal", "italic"],
  weight: ["400", "600", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://veloura.example.com"),
  title: {
    default: "Veloura — Shopping that gets you",
    template: "%s — Veloura",
  },
  description:
    "Veloura is a smarter place to shop electronics — personalized picks, honest search, and a shopping assistant that knows the catalog.",
  applicationName: "Veloura",
  manifest: "/manifest.webmanifest",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: "Veloura — Shopping that gets you",
    description:
      "Personalized picks, honest search, and a shopping assistant that knows the catalog.",
    siteName: "Veloura",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Veloura — Shopping that gets you",
    description:
      "Personalized picks, honest search, and a shopping assistant that knows the catalog.",
  },
  // Explicit `icons` here takes over from the src/app/favicon.ico file
  // convention entirely, so both are declared in one place instead of Next
  // silently merging two separate sources of truth: the SVG first (modern
  // browsers), the .ico as an explicit fallback (older browsers/scrapers
  // that only understand .ico).
  icons: {
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/favicon.ico", sizes: "any" },
    ],
  },
};

export const viewport = {
  themeColor: "#b45309",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`h-full scroll-smooth ${inter.variable} ${playfair.variable}`}>
      <body className="min-h-full flex flex-col" style={{ background: "var(--clr-bg)", color: "var(--clr-text-primary)" }}>
        <a href="#main-content" className="skip-link">
          Skip to content
        </a>
        <Navbar />
        <main id="main-content" className="flex-1">{children}</main>
        <Footer />
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
