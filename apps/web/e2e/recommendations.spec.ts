import { test, expect } from "@playwright/test";

/**
 * Recommendations now come from apps/api's real hybrid engine (content similarity,
 * collaborative signal, popularity/cold-start), resolved against the real catalog client-side
 * (see lib/hooks/useRecommendations.ts) — replacing the old client-only static-catalog
 * heuristic. These assert real product cards render, not exact ranking/copy, since the
 * real engine's output isn't deterministic the way the old rule-based one was.
 */
test.describe("recommendations", () => {
  test("the home page shows a real recommended-products rail", async ({ page }) => {
    await page.goto("/");
    const section = page.locator("section", { hasText: /Recommended for you|Popular right now/ }).first();
    await expect(section.locator('a[href^="/products/"]').first()).toBeVisible({ timeout: 10000 });
  });

  test("the home page shows a real trending rail", async ({ page }) => {
    await page.goto("/");
    const section = page.locator("section", { hasText: "Trending now" }).first();
    await expect(section.locator('a[href^="/products/"]').first()).toBeVisible({ timeout: 10000 });
  });

  test("/recommendations shows real products with a Popular/Personalized badge", async ({ page }) => {
    await page.goto("/recommendations");
    await expect(page.getByRole("heading", { name: "Recommended for you" })).toBeVisible();
    await expect(page.locator(".badge").filter({ hasText: /^(Personalized|Popular picks)$/ })).toBeVisible();
    await expect(page.locator('a[href^="/products/"]').first()).toBeVisible({ timeout: 10000 });
  });

  test("a product detail page shows a real similar-products rail", async ({ page }) => {
    // Any product with an embedding has neighbors in a catalog this size, so content
    // similarity is reliable — unlike frequently-bought-with, which depends on that
    // specific product's category having a complementary-category mapping and is left
    // untested here to avoid flaking on whichever product happens to be first in /shop.
    await page.goto("/shop");
    await page.locator('a[href^="/products/"]').first().click();
    await expect(page).toHaveURL(/\/products\//);

    await expect(page.getByRole("heading", { name: "Similar products" })).toBeVisible({ timeout: 10000 });
  });
});
