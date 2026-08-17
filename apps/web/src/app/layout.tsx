import type { Metadata } from "next";
import { Inter, Playfair_Display } from "next/font/google";
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
  icons: {
    icon: "/favicon.svg",
  },
};

export const viewport = {
  themeColor: "#b45309",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`h-full scroll-smooth ${inter.variable} ${playfair.variable}`}>
      <body className="min-h-full flex flex-col" style={{ background: "var(--clr-bg)", color: "var(--clr-text-primary)" }}>
        <Navbar />
        <main className="flex-1">{children}</main>
        <Footer />
      </body>
    </html>
  );
}
