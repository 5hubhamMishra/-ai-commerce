import { test, expect } from "@playwright/test";

/**
 * This app's auth is a client-only demo (login.tsx: "Demo authentication — any email and
 * password work") — there is no real backend session here (apps/web hasn't been rewired
 * onto the live API yet, ADR-027). These tests exercise the actual local-state auth flow
 * as built, not a real credential check.
 */
test.describe("auth", () => {
  test("registering signs the user in and personalizes the nav", async ({ page }) => {
    await page.goto("/register");
    await page.getByLabel("Full name").fill("Ada Lovelace");
    await page.getByLabel("Email address").fill("ada@example.com");
    await page.getByRole("button", { name: /Create account/i }).click();

    await expect(page).toHaveURL("/");
    await expect(page.getByRole("link", { name: /Ada/ })).toBeVisible();
  });

  test("logging in redirects home and shows the account link", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email address").fill("shopper@example.com");
    await page.getByLabel("Password").fill("anything");
    await page.getByRole("button", { name: "Sign in to Veloura" }).click();

    await expect(page).toHaveURL("/");
    await expect(page.getByRole("link", { name: /Shopper/ })).toBeVisible();
  });

  test("a logged-out visitor sees a sign-in link, not an account name", async ({ page }) => {
    await page.goto("/");
    await expect(
      page.getByRole("banner").getByRole("link", { name: "Sign in" }),
    ).toBeVisible();
  });
});
