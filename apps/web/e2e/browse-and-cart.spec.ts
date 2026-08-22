import { test, expect } from "@playwright/test";
import { registerAndSignIn } from "./helpers";

/**
 * The critical shopper journey against the real backend: land on the home page, browse a
 * category, open a product, add it to the real cart, review the cart, and complete the
 * (still-simulated, ADR-027) checkout through to an order confirmation. Adding to cart
 * requires a signed-in session — there is no guest cart in the real API.
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
    await registerAndSignIn(page);

    await page.goto("/shop");
    const firstProductLink = page.locator('a[href^="/products/"]').first();
    await expect(firstProductLink).toBeVisible();
    await firstProductLink.click();
    await expect(page).toHaveURL(/\/products\//);

    const productName = await page.getByRole("heading", { level: 1 }).textContent();
    await page.getByRole("button", { name: "Add to cart" }).first().click();
    await expect(page.getByRole("button", { name: /Added to cart/ })).toBeVisible();

    await page.goto("/cart");
    await expect(page.getByRole("heading", { name: "Your cart" })).toBeVisible();
    if (productName) {
      await expect(page.getByText(productName.trim(), { exact: false })).toBeVisible();
    }

    await page.getByRole("link", { name: "Checkout" }).click();
    await expect(page).toHaveURL(/\/checkout/);

    // A fresh test account has no saved addresses, so the add-address form shows by
    // default — fill it and save, which folds it into the (now real) selectable list.
    await page.getByPlaceholder("House no, building, street").fill("221B Baker Street");
    await page.getByPlaceholder("City").fill("Mumbai");
    await page.getByPlaceholder("State").fill("Maharashtra");
    await page.getByPlaceholder("PIN code").fill("400001");
    await page.getByRole("button", { name: "Save address" }).click();

    // Saving the address triggers a real shipping-quote fetch; the first method is
    // auto-selected once quotes arrive, so "Place order" becomes enabled on its own.
    await expect(page.getByRole("button", { name: /Place order/ })).toBeEnabled({ timeout: 10000 });
    await page.getByRole("button", { name: /Place order/ }).click();

    // The old fake checkout was a pure client-side state transition (instant); this is
    // now a real order round-trip (create order -> create payment -> confirm payment)
    // plus a real client-side navigation — both slower under parallel-worker load, hence
    // the more generous timeout. Real order ids are UUIDs, not the old fake "ORD-" prefix.
    await expect(page).toHaveURL(/\/orders\/[0-9a-f-]{36}/, { timeout: 15000 });
    await expect(page.getByText(/Order confirmed/i).first()).toBeVisible();
    if (productName) {
      await expect(page.getByText(productName.trim(), { exact: false })).toBeVisible();
    }
  });

  test("removing the only item empties the cart and shows the empty state", async ({ page }) => {
    await registerAndSignIn(page);

    await page.goto("/shop");
    await page.locator('a[href^="/products/"]').first().click();
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

  test("a guest who tries to add to cart is sent to sign in, then back to the product", async ({
    page,
  }) => {
    const { email } = await registerAndSignIn(page);
    await page.goto("/profile");
    await page.getByRole("button", { name: "Sign out" }).click();

    await page.goto("/shop");
    await page.locator('a[href^="/products/"]').first().click();
    await expect(page).toHaveURL(/\/products\//);
    const productPath = new URL(page.url()).pathname;

    await page.getByRole("button", { name: "Add to cart" }).first().click();
    await expect(page).toHaveURL(new RegExp(`/login\\?redirect=${encodeURIComponent(productPath)}`));

    await page.getByLabel("Email address").fill(email);
    await page.getByLabel("Password").fill("Playwright123!");
    await page.getByRole("button", { name: "Sign in to Veloura" }).click();

    await expect(page).toHaveURL(productPath);
  });
});
