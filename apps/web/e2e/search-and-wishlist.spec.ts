import { test, expect } from "@playwright/test";

test.describe("search", () => {
  test("searching from the navbar finds real, relevant products", async ({ page }) => {
    await page.goto("/");
    const searchInput = page.getByPlaceholder("Search products...");
    await searchInput.fill("laptop");
    await searchInput.press("Enter");

    await expect(page).toHaveURL(/\/search\?q=laptop/);
    await expect(page.locator('a[href^="/product/"]').first()).toBeVisible();
  });

  test("a nonsense query returns the no-results state, not unrelated products", async ({
    page,
  }) => {
    await page.goto("/search?q=zzxxqqxyzznonexistentgarble");
    await expect(page.getByText(/No results for/)).toBeVisible();
  });
});

test.describe("wishlist", () => {
  test("wishlisting a product from the grid shows it on the wishlist page", async ({ page }) => {
    await page.goto("/shop");
    const firstCard = page.locator('a[href^="/product/"]').first();
    const productName = await firstCard.getByRole("heading", { level: 3 }).textContent();

    await page.getByRole("button", { name: "Add to wishlist" }).first().click();

    await page.goto("/wishlist");
    await expect(page.getByRole("heading", { name: "Your Wishlist" })).toBeVisible();
    if (productName) {
      await expect(page.getByText(productName.trim(), { exact: false })).toBeVisible();
    }
  });

  test("an empty wishlist shows the empty state with a link back to shop", async ({ page }) => {
    await page.goto("/wishlist");
    await expect(page.getByText("Nothing saved yet")).toBeVisible();
    await expect(page.getByRole("link", { name: "Explore products" })).toBeVisible();
  });
});
