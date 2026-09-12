import { SITE_URL } from "@/lib/site-url";

export function GET() {
  return new Response(`# Veloura: page not found

This URL does not exist. The page may have moved or the address may be mistyped.

- [Home](${SITE_URL}/)
- [Shop catalog](${SITE_URL}/shop)
- [Sitemap](${SITE_URL}/sitemap.xml)
- [Agent guidance](${SITE_URL}/llms.txt)
- [Developer resources](${SITE_URL}/developers)
`, {
    status: 404,
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Cache-Control": "no-store",
      Vary: "Accept",
    },
  });
}
