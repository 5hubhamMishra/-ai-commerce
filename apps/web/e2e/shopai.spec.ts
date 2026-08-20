import { test, expect } from "@playwright/test";

/**
 * ShopAI here is a deterministic, rule-based assistant (src/lib/shopai.ts), not an LLM —
 * "training" it means expanding what question patterns it can answer directly instead of
 * just returning a product list. These tests exercise that real behavior end to end.
 */
test.describe("ShopAI answers questions directly, not just listing products", () => {
  test("a category search finds the new apparel/grocery catalog and states a real reason for the top pick", async ({
    page,
  }) => {
    await page.goto("/ai-shopping");
    const input = page.getByPlaceholder("Ask ShopAI anything...");
    await input.fill("show me some running shoes");
    await page.getByRole("button", { name: "Send" }).click();

    await expect(page.getByText(/I'd go with/)).toBeVisible({ timeout: 5000 });
    await expect(page.locator('a[href^="/product/"]').first()).toBeVisible();
  });

  test("a follow-up spec question about the shown product gets a direct answer, not a card dump", async ({
    page,
  }) => {
    await page.goto("/ai-shopping");
    const input = page.getByPlaceholder("Ask ShopAI anything...");

    await input.fill("show me some running shoes");
    await page.getByRole("button", { name: "Send" }).click();
    await expect(page.getByText(/I'd go with/)).toBeVisible({ timeout: 5000 });

    await input.fill("what is the sole type");
    await page.getByRole("button", { name: "Send" }).click();
    await expect(page.getByText(/Sole Type on the/)).toBeVisible({ timeout: 5000 });
  });

  test("a store-policy question is answered directly instead of running a doomed product search", async ({
    page,
  }) => {
    await page.goto("/ai-shopping");
    const input = page.getByPlaceholder("Ask ShopAI anything...");
    await input.fill("what is your shipping policy");
    await page.getByRole("button", { name: "Send" }).click();

    await expect(page.getByText(/free on orders over/i)).toBeVisible({ timeout: 5000 });
  });

  test("a catalog-overview question lists real categories instead of describing whatever was last shown (regression)", async ({
    page,
  }) => {
    // Reproduces a live-reported bug: after a search shows a product, "tell me the type
    // of items that are listed on the site" was misread as "tell me about it" and
    // answered with that product's spec sheet instead of the actual question asked.
    await page.goto("/ai-shopping");
    const input = page.getByPlaceholder("Ask ShopAI anything...");

    await input.fill("a laptop for coding under 80000");
    await page.getByRole("button", { name: "Send" }).click();
    await expect(page.getByText(/I'd go with/)).toBeVisible({ timeout: 5000 });

    await input.fill("tell me the type of items that are listed on the site");
    await page.getByRole("button", { name: "Send" }).click();

    const lastReply = page.locator("p.whitespace-pre-line").last();
    await expect(lastReply).toContainText("We carry", { timeout: 5000 });
    await expect(lastReply).toContainText("Footwear");
    await expect(lastReply).toContainText("Groceries");
  });
});
