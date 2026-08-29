import { NextResponse, type NextRequest } from "next/server";

const HOME_MARKDOWN = `# Veloura

Veloura is a personalized e-commerce storefront for discovering products through catalog browsing, search, recommendations, product comparison, wishlist, cart, checkout, order tracking, and ShopAI, a catalog-grounded AI shopping assistant.

## Public paths

- /shop - browse the product catalog
- /search - search products in plain language
- /recommendations - view personalized and trending product picks
- /ai-shopping - ask ShopAI for shopping guidance
- /compare - compare products
- /about - learn what Veloura provides
- /contact - find verified in-app support paths
- /privacy - privacy overview
- /sitemap.xml - public sitemap
- /robots.txt - crawler guidance
- /llms.txt - machine-readable site summary
`;

export function proxy(request: NextRequest) {
  const accept = request.headers.get("accept") ?? "";
  if (accept.includes("text/markdown") && !accept.includes("text/html")) {
    return new NextResponse(HOME_MARKDOWN, {
      headers: {
        "content-type": "text/markdown; charset=utf-8",
        vary: "Accept",
      },
    });
  }

  return NextResponse.next();
}

export const config = {
  matcher: "/",
};
