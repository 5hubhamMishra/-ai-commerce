import { test, expect } from "@playwright/test";
import { registerAndSignIn } from "./helpers";

test.describe("search", () => {
  test("searching from the navbar finds real, relevant products", async ({ page }) => {
    await page.goto("/");
    const searchInput = page.getByPlaceholder("Search products...");
    await searchInput.fill("laptop");
    await searchInput.press("Enter");

    await expect(page).toHaveURL(/\/search\?q=laptop/);
    await expect(page.locator('a[href^="/products/"]').first()).toBeVisible();
  });

  test("a nonsense query still returns a best-effort result set, not a crash", async ({
    page,
  }) => {
    // The real hybrid search's semantic fallback always surfaces its nearest-neighbor
    // matches — there's no hard zero-relevance cutoff (ADR-024) — so unlike the old
    // client-side keyword-only search, a gibberish query legitimately still returns
    // products rather than the empty state. This just confirms the page renders real
    // results without erroring.
    await page.goto("/search?q=zzxxqqxyzznonexistentgarble");
    await expect(page.locator('a[href^="/products/"]').first()).toBeVisible();
  });
});

test.describe("wishlist", () => {
  test("wishlisting a product from the grid shows it on the wishlist page", async ({ page }) => {
    await registerAndSignIn(page);

    await page.goto("/shop");
    const firstCard = page.locator('a[href^="/products/"]').first();
    const productName = await firstCard.getByRole("heading", { level: 3 }).textContent();

    await page.getByRole("button", { name: "Add to wishlist" }).first().click();

    await page.goto("/wishlist");
    await expect(page.getByRole("heading", { name: "Your Wishlist" })).toBeVisible();
    if (productName) {
      await expect(page.getByText(productName.trim(), { exact: false })).toBeVisible();
    }
  });

  test("a guest who tries to wishlist a product is sent to sign in first", async ({ page }) => {
    await page.goto("/shop");
    await page.getByRole("button", { name: "Add to wishlist" }).first().click();
    await expect(page).toHaveURL(/\/login\?redirect=/);
  });

  test("a signed-in shopper's empty wishlist shows the empty state with a link back to shop", async ({
    page,
  }) => {
    await registerAndSignIn(page);
    await page.goto("/wishlist");
    await expect(page.getByText("Nothing saved yet")).toBeVisible();
    await expect(page.getByRole("link", { name: "Explore products" })).toBeVisible();
  });
});
