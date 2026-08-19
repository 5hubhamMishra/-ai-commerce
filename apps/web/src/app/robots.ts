import type { MetadataRoute } from "next";

const BASE_URL = "https://veloura.example.com";

/** Disallows the private/session-specific and internal-tooling routes —
 *  none of them have content a crawler should index, and /admin
 *  specifically shouldn't be discoverable via search (see Footer.tsx: it's
 *  no longer publicly linked either, for the same reason — this demo build
 *  has no auth gate on that route). */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/admin",
        "/cart",
        "/checkout",
        "/orders",
        "/profile",
        "/wishlist",
        "/login",
        "/register",
      ],
    },
    sitemap: `${BASE_URL}/sitemap.xml`,
  };
}
