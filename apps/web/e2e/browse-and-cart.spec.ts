import { test, expect } from "@playwright/test";

/**
 * The critical shopper journey: land on the home page, browse a category, open a product,
 * add it to the cart, review the cart, and complete the (simulated) checkout through to an
 * order confirmation. This app is a client-only demo (ADR-027 — apps/web still reads static
 * JSON, not the live API) so checkout is a local state transition, not a real payment.
 */
test.describe("browse, add to cart, and checkout", () => {
  test("home page loads with real catalog content", async ({ page }) => {
    await page.goto("/");
    await expect(
      page.getByRole("banner").getByRole("link", { name: "Veloura" }),
    ).toBeVisible();
    await expect(page.getByRole("heading", { name: /Shopping that/i })).toBeVisible();
    await expect(page.getByRole("link", { name: "Browse the catalog" })).toBeVisible();
  });

  test("browsing a category shows real products", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "Laptops", exact: true }).first().click();
    await expect(page).toHaveURL(/\/category\/laptops/);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    // At least one real product card rendered with a price.
    await expect(page.locator("text=/₹/").first()).toBeVisible();
  });

  test("full journey: product detail -> add to cart -> checkout -> order confirmation", async ({
    page,
  }) => {
    await page.goto("/shop");
    const firstProductLink = page.locator('a[href^="/product/"]').first();
    await expect(firstProductLink).toBeVisible();
    await firstProductLink.click();
    await expect(page).toHaveURL(/\/product\//);

    const productName = await page.getByRole("heading", { level: 1 }).textContent();
    await page.getByRole("button", { name: "Add to cart" }).first().click();

    await page.goto("/cart");
    await expect(page.getByRole("heading", { name: "Your cart" })).toBeVisible();
    if (productName) {
      await expect(page.getByText(productName.trim(), { exact: false })).toBeVisible();
    }

    await page.getByRole("link", { name: "Checkout" }).click();
    await expect(page).toHaveURL(/\/checkout/);

    await page
      .getByLabel("Shipping address")
      .fill("221B Baker Street, Mumbai, Maharashtra, 400001");
    await page.getByRole("button", { name: /Place order/ }).click();

    await expect(page).toHaveURL(/\/orders\/ORD-/, { timeout: 5000 });
    await expect(page.getByText(/Order confirmed/i)).toBeVisible();
  });

  test("removing the only item empties the cart and shows the empty state", async ({ page }) => {
    await page.goto("/shop");
    await page.locator('a[href^="/product/"]').first().click();
    await page.getByRole("button", { name: "Add to cart" }).first().click();

    await page.goto("/cart");
    await page.getByRole("button", { name: "Remove" }).click();

    await expect(page.getByText("Your cart is empty")).toBeVisible();
  });

  test("checkout redirects an empty cart to the empty-cart state, not a broken order", async ({
    page,
  }) => {
    await page.goto("/checkout");
    await expect(page.getByText("Your cart is empty")).toBeVisible();
    await expect(page.getByText("You cannot checkout with an empty cart.")).toBeVisible();
  });
});
