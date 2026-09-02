import type { NextConfig } from "next";

if (process.env.VERCEL === "1" && !process.env.NEXT_PUBLIC_API_URL?.trim()) {
  throw new Error(
    "NEXT_PUBLIC_API_URL is required for Vercel web builds; set it to the deployed API /api/v1 URL.",
  );
}

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), geolocation=(), microphone=()" },
        ],
      },
    ];
  },
  images: {
    dangerouslyAllowSVG: true,
    contentDispositionType: "inline",
    // The showcase catalog in apps/api/prisma/seed-data/presentation-products.json links
    // directly to each product's real image on its official manufacturer/retailer store
    // (never downloaded/hosted here) — one entry per hostname actually used there.
    remotePatterns: [
      { protocol: "https", hostname: "dlcdnwebimgs.asus.com" },
      { protocol: "https", hostname: "www.apple.com" },
      { protocol: "https", hostname: "us.sennheiser-hearing.com" },
      { protocol: "https", hostname: "image-us.samsung.com" },
      { protocol: "https", hostname: "images.samsung.com" },
      { protocol: "https", hostname: "assets2.razerzone.com" },
      { protocol: "https", hostname: "assets.corsair.com" },
      { protocol: "https", hostname: "s7d1.scene7.com" },
      { protocol: "https", hostname: "assets.bosecreative.com" },
      { protocol: "https", hostname: "www.spigen.com" },
    ],
  },
  // Next's default bundler skips transpiling anything under node_modules, including these
  // workspace packages (symlinked, shipped as raw TS with no build step of their own) — this
  // opts them back in so `next dev`/`next build` actually compile them.
  transpilePackages: ["@ai-commerce/types", "@ai-commerce/api-client"],
};

export default nextConfig;
