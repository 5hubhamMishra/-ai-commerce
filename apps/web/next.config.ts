import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    dangerouslyAllowSVG: true,
    contentDispositionType: "inline",
  },
  // Next's default bundler skips transpiling anything under node_modules, including these
  // workspace packages (symlinked, shipped as raw TS with no build step of their own) — this
  // opts them back in so `next dev`/`next build` actually compile them.
  transpilePackages: ["@ai-commerce/types", "@ai-commerce/api-client"],
};

export default nextConfig;
