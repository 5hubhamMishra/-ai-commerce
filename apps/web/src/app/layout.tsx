import type { Metadata } from "next";
import { Inter, Playfair_Display } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import "./globals.css";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import SessionProvider from "@/components/SessionProvider";

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

// Vercel sets this automatically to the production domain (no scheme) on every deploy —
// falls back to the current known deployment for local builds / before a custom domain exists.
const SITE_URL = `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL ?? "web-lyart-three-94.vercel.app"}`;

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Veloura — Shopping that gets you",
    template: "%s — Veloura",
  },
  description:
    "Veloura is a personalized place to shop electronics — grounded picks, honest search, and an AI shopping assistant that knows the catalog.",
  applicationName: "Veloura",
  manifest: "/manifest.webmanifest",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: "Veloura — Shopping that gets you",
    description:
      "Grounded picks, honest search, and an AI shopping assistant that knows the catalog.",
    siteName: "Veloura",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Veloura — Shopping that gets you",
    description:
      "Grounded picks, honest search, and an AI shopping assistant that knows the catalog.",
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

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`h-full scroll-smooth ${inter.variable} ${playfair.variable}`}
    >
      <body
        className="min-h-full flex flex-col"
        style={{
          background: "var(--clr-bg)",
          color: "var(--clr-text-primary)",
        }}
      >
        <a href="#main-content" className="skip-link">
          Skip to content
        </a>
        <SessionProvider />
        <Navbar />
        <main id="main-content" className="flex-1">
          {children}
        </main>
        <Footer />
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
