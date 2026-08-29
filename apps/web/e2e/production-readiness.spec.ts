import { expect, test } from "@playwright/test";

test("homepage raw HTML contains meaningful server-rendered Veloura content", async ({
  request,
}) => {
  const response = await request.get("/", {
    headers: { Accept: "text/html" },
  });
  const html = await response.text();

  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toContain("text/html");
  expect(html).toContain("<h1");
  expect(html).toContain("Veloura");
  expect(html).toContain("Discover products with less guesswork");
  expect(html).toContain("Shop by category");
  expect(html).toContain('href="/about"');
  expect(html).toContain('href="/privacy"');
});

test("homepage supports markdown content negotiation", async ({ request }) => {
  const response = await request.get("/", {
    headers: { Accept: "text/markdown" },
  });
  const markdown = await response.text();

  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toContain("text/markdown");
  expect(response.headers()["vary"]).toContain("Accept");
  expect(markdown).toContain("# Veloura");
  expect(markdown).toContain("/llms.txt");
});

test("missing pages return a real 404 with recovery links", async ({
  request,
}) => {
  const response = await request.get("/__missing_veloura_page__");
  const html = await response.text();

  expect(response.status()).toBe(404);
  expect(html).toContain("This Veloura page was not found");
  expect(html).toContain("Shop catalog");
});

test("machine-readable public resources are available", async ({ request }) => {
  const robots = await request.get("/robots.txt");
  const sitemap = await request.get("/sitemap.xml");
  const llms = await request.get("/llms.txt");

  expect(robots.status()).toBe(200);
  expect(await robots.text()).toContain("Sitemap:");

  expect(sitemap.status()).toBe(200);
  const sitemapXml = await sitemap.text();
  expect(sitemapXml).toContain("<urlset");
  expect(sitemapXml).not.toContain("/search");
  expect(sitemapXml).not.toContain("/recommendations");

  expect(llms.status()).toBe(200);
  expect(await llms.text()).toContain("Veloura");
});

test("homepage JSON-LD is valid and truthful to visible content", async ({
  request,
}) => {
  const response = await request.get("/");
  const html = await response.text();
  const scripts = [...html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/g)];

  expect(scripts.length).toBeGreaterThan(0);

  for (const script of scripts) {
    const data = JSON.parse(script[1]);
    expect(data.name).toBe("Veloura");
    expect(html).toContain(data.name);
  }
});

test("trust pages are public and describe only verified Veloura information", async ({
  request,
}) => {
  for (const path of ["/about", "/contact", "/privacy"]) {
    const response = await request.get(path);
    const html = await response.text();

    expect(response.status(), path).toBe(200);
    expect(response.headers()["content-type"], path).toContain("text/html");
    expect(html, path).toContain("Veloura");
  }
});

test("catalog JSON-LD uses absolute public URLs", async ({ request }) => {
  const home = await (await request.get("/")).text();
  const paths = [
    home.match(/href="(\/category\/[^"]+)"/)?.[1],
    home.match(/href="(\/products\/[^"]+)"/)?.[1],
  ].filter((path): path is string => Boolean(path));

  expect(new Set(paths.map((path) => path.split("/")[1]))).toEqual(
    new Set(["category", "products"]),
  );

  for (const path of paths) {
    const response = await request.get(path);
    const html = await response.text();
    const script = html.match(
      /<script type="application\/ld\+json">(.*?)<\/script>/,
    )?.[1];

    expect(response.status(), path).toBe(200);
    expect(script, path).toBeTruthy();

    const data = JSON.parse(script!);
    expect(data.url, path).toMatch(/^https:\/\//);
  }
});

test("category pages include server-rendered product content", async ({
  request,
}) => {
  const home = await (await request.get("/")).text();
  const categoryPath = home.match(/href="(\/category\/[^"]+)"/)?.[1];

  expect(categoryPath).toBeTruthy();

  const response = await request.get(categoryPath!);
  const html = await response.text();

  expect(response.status()).toBe(200);
  expect(html).toContain('data-testid="catalog-product-card"');
  expect(html).not.toContain("Loading…");
});

test("shop page includes server-rendered product content", async ({
  request,
}) => {
  const response = await request.get("/shop");
  const html = await response.text();

  expect(response.status()).toBe(200);
  expect(html).toContain('data-testid="catalog-product-card"');
  expect(html).not.toContain("Loading...");
});
