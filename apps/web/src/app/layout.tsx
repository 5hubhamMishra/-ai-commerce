import type { Metadata } from "next";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import "./globals.css";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import SessionProvider from "@/components/SessionProvider";
import { safeJsonLd } from "@/lib/jsonLd";
import { SITE_URL } from "@/lib/site-url";

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

// Organization schema, site-wide (every page shares one brand identity — the homepage's own
// JSON-LD covers WebSite/OnlineStore separately). No sameAs/address/contactPoint: no real
// social profiles or business contact info exist in this repo to publish truthfully.
const organizationJsonLd = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "Veloura",
  url: SITE_URL,
  logo: `${SITE_URL}/icon-512.svg`,
  description:
    "Veloura is a personalized place to shop electronics — grounded picks, honest search, and an AI shopping assistant that knows the catalog.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className="h-full scroll-smooth"
    >
      <body
        className="min-h-full flex flex-col"
        style={{
          background: "var(--clr-bg)",
          color: "var(--clr-text-primary)",
        }}
      >
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: safeJsonLd(organizationJsonLd) }}
        />
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
