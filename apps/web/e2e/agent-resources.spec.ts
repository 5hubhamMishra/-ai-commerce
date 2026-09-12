import { expect, test } from "@playwright/test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

test("MCP initializes and reads guidance over the production HTTP transport", async ({ baseURL }) => {
  const client = new Client({ name: "veloura-http-check", version: "1.0.0" });
  try {
    await client.connect(new StreamableHTTPClientTransport(new URL(`${baseURL}/.well-known/mcp`)));
    const { resources } = await client.listResources();
    expect(resources).toHaveLength(1);
    const { contents } = await client.readResource({ uri: resources[0].uri });
    const [content] = contents;
    if (!("text" in content)) throw new Error("Expected a text resource");
    expect(content.text).toContain("## When to use Veloura");
    expect(client.getServerCapabilities()?.tools).toBeUndefined();
  } finally {
    await client.close();
  }
});

test("public discovery resources and genuine 404 recovery", async ({ request }) => {
  const missing = await request.get("/some-path-that-does-not-exist");
  expect(missing.status()).toBe(404);
  const body = await missing.text();
  for (const href of ["/", "/sitemap.xml", "/llms.txt", "/developers"]) {
    expect(body).toContain(`href="${href}"`);
  }
  for (const [path, type, content] of [
    ["/robots.txt", "text/plain", "Sitemap:"],
    ["/sitemap.xml", "application/xml", "/developers"],
    ["/llms.txt", "text/plain", "## When to use Veloura"],
    ["/developers", "text/html", "Veloura developer resources"],
    ["/.well-known/mcp", "application/json", "streamable-http"],
    ["/.well-known/mcp/server-card.json", "application/json", "serverUrl"],
  ]) {
    const response = await request.get(path);
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toContain(type);
    expect(await response.text()).toContain(content);
  }
});

test("unmatched URLs offer Markdown 404 recovery without intercepting existing routes", async ({ request }) => {
  const path = "/missing-remediation-page/nested";
  const markdown = await request.get(path, { headers: { Accept: "text/markdown" } });
  expect(markdown.status()).toBe(404);
  expect(markdown.headers()["content-type"]).toContain("text/markdown");
  expect(markdown.headers().vary).toContain("Accept");
  expect(markdown.headers()["cache-control"]).toContain("no-store");
  expect(await markdown.text()).toContain("[Sitemap](https://web-lyart-three-94.vercel.app/sitemap.xml)");
  for (const accept of ["text/html", "text/markdown;q=0", "*/*"]) {
    const html = await request.get(path, { headers: { Accept: accept } });
    expect(html.status()).toBe(404);
    expect(html.headers()["content-type"]).toContain("text/html");
    expect(await html.text()).toContain("This Veloura page was not found");
  }
  for (const path of ["/", "/developers", "/llms.txt", "/.well-known/mcp/server-card.json"]) {
    const response = await request.get(path, { headers: { Accept: "text/markdown" } });
    expect(response.status()).toBe(200);
    expect(await response.text()).not.toContain("# Veloura: page not found");
  }
});

test("MCP rejects invalid requests without exposing capabilities", async ({ request }) => {
  const endpoint = "/.well-known/mcp";
  const headers = { "Content-Type": "application/json", Accept: "application/json, text/event-stream" };
  for (const [data, status, code] of [
    ["{", 400, -32700],
    [JSON.stringify({ method: "resources/list", id: 1 }), 400, -32600],
    [JSON.stringify([{ jsonrpc: "2.0", method: "resources/list", id: 1 }]), 400, -32600],
    ["x".repeat(16_385), 413, undefined],
  ] as const) {
    const response = await request.post(endpoint, { headers, data: Buffer.from(data) });
    expect(response.status()).toBe(status);
    if (code !== undefined) expect((await response.json()).error.code).toBe(code);
  }
  for (const [extraHeaders, status] of [
    [{ Origin: "https://untrusted.example" }, 403],
    [{ "MCP-Protocol-Version": "1900-01-01" }, 400],
  ] as const) {
    for (const method of ["GET", "POST"]) {
      const response = await request.fetch(endpoint, { method, headers: { ...headers, ...extraHeaders } });
      expect(response.status()).toBe(status);
    }
  }
  const stream = await request.get(endpoint, { headers: { Accept: "text/event-stream" } });
  expect(stream.status()).toBe(405);
  expect(stream.headers().allow).toBe("POST");
});

test("homepage remains useful without JavaScript and has one truthful Organization", async ({ browser, baseURL }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  try {
    await page.goto(`${baseURL}/`);
    await expect(page.getByRole("heading", { name: "Veloura", exact: true, level: 1 })).toBeVisible();
    await expect(page.getByText("Discover products with less guesswork")).toBeVisible();
    await expect(page.getByRole("link", { name: "Browse the catalog", exact: true })).toHaveAttribute("href", "/shop");
    await expect(page.getByTestId("catalog-product-card").first().or(
      page.getByRole("heading", { name: "No products found", exact: true }),
    )).toBeVisible();
    const schemas = await page.locator('script[type="application/ld+json"]').allTextContents();
    const organizations = schemas.map((text) => JSON.parse(text)).filter((value) => value["@type"] === "Organization");
    expect(organizations).toHaveLength(1);
    expect(organizations[0].name).toBe("Veloura");
    expect(organizations[0].address).toBeUndefined();
    expect(organizations[0].contactPoint).toBeUndefined();
  } finally {
    await context.close();
  }
});

test("developer guidance fits a mobile viewport", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/developers");
  await expect(page.getByRole("heading", { name: "Veloura developer resources", level: 1 })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("developers-mobile.png"), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});
