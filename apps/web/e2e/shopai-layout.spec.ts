import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("saved product recommendations retain their images, prices, and links", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("veloura-shopai-visible-history:guest", JSON.stringify([
      { role: "user", content: "Headphones for work" },
      {
        role: "assistant",
        content: "Here is a match from your previous conversation.",
        products: [{
          id: "layout-product",
          slug: "layout-headphones",
          name: "Over-ear headphones with a comfortable adjustable headband",
          primaryImageUrl: "/products/items/headphones-2.jpg",
          minPrice: 4999,
          brand: { name: "Audio" },
        }],
      },
    ]));
  });
  await page.goto("/ai-shopping");
  const product = page.getByRole("link", { name: /Over-ear headphones/ });
  await expect(product).toHaveAttribute("href", "/products/layout-headphones");
  await expect(product).toContainText("4,999");
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await product.scrollIntoViewIfNeeded();
    await expect(product).toBeVisible();
    await expect.poll(() => product.locator("img").evaluate((image) =>
      (image as HTMLImageElement).naturalWidth,
    )).toBeGreaterThan(0);
    await expect.poll(() => page.evaluate(() =>
      document.documentElement.scrollWidth <= window.innerWidth,
    )).toBe(true);
    await page.screenshot({ path: `test-results/shopai-products-${width}.png` });
  }
});

for (const viewport of [
  { width: 1440, height: 900 },
  { width: 390, height: 844 },
  { width: 320, height: 640 },
]) {
  test(`ShopAI remains usable at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.route("**/shopai/message", async (route) => {
      await route.fulfill({
        json: {
          conversationId: "layout-conversation",
          message: { role: "assistant", content: "Let's narrow down your choices. What matters most to you?" },
          toolActivity: [],
        },
      });
    });
    await page.goto("/ai-shopping");
    const assistant = page.getByRole("region", { name: "ShopAI shopping assistant" });
    await expect(page.getByRole("heading", { name: "ShopAI", exact: true })).toBeVisible();
    const send = page.getByRole("button", { name: "Send", exact: true });
    await expect(send).toBeDisabled();
    const input = page.getByRole("textbox", { name: "Message ShopAI" });
    await expect(input).toBeInViewport();
    await expect(assistant.locator("img")).toHaveCount(4);
    await expect.poll(() => assistant.locator("img").evaluateAll((images) =>
      images.every((image) => (image as HTMLImageElement).naturalWidth > 0),
    )).toBe(true);
    await page.screenshot({ path: `test-results/shopai-welcome-${viewport.width}.png` });
    const results = await new AxeBuilder({ page }).include('[aria-label="ShopAI shopping assistant"]').analyze();
    expect(results.violations).toEqual([]);

    await input.fill("   ");
    await expect(send).toBeDisabled();
    await input.fill("A laptop for work");
    await send.click();
    await expect(page.getByRole("log")).toContainText("What matters most to you?");
    await expect(input).toHaveValue("");
    await expect(input).toBeInViewport();
    await expect.poll(() => page.evaluate(() =>
      document.documentElement.scrollWidth <= window.innerWidth,
    )).toBe(true);
    await page.screenshot({ path: `test-results/shopai-chat-${viewport.width}.png` });
    await page.getByRole("checkbox", { name: "Clear all when I leave" }).check();
    await page.reload();
    await expect(page.getByRole("heading", { name: "ShopAI", exact: true })).toBeVisible();
  });
}
