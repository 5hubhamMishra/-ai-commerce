import { test, expect } from "@playwright/test";
import { registerAndSignIn } from "./helpers";

/**
 * Real auth against apps/api — register/login/logout hit the live backend. Requires a
 * seeded, running apps/api + Postgres/Redis alongside apps/web (see docs/DEVELOPMENT.md).
 */
test.describe("auth", () => {
  test("registering signs the user in and personalizes the nav", async ({ page }) => {
    await registerAndSignIn(page, "Ada Lovelace");
    await expect(page.getByRole("button", { name: /Ada/ })).toBeVisible();
  });

  test("logging in with the right password redirects home and shows the account link", async ({ page }) => {
    const { email } = await registerAndSignIn(page, "Shopper");
    await page.goto("/profile");
    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page.getByRole("banner").getByRole("link", { name: "Sign in" })).toBeVisible();

    await page.goto("/login");
    await page.getByLabel("Email address").fill(email);
    await page.getByLabel("Password").fill("Playwright123!");
    await page.getByRole("button", { name: "Sign in to Veloura" }).click();

    await expect(page).toHaveURL("/");
    await expect(page.getByRole("button", { name: /Shopper/ })).toBeVisible();
  });

  test("logging in with a wrong password shows a real error, not a silent success", async ({ page }) => {
    const { email } = await registerAndSignIn(page, "Shopper");
    await page.goto("/profile");
    await page.getByRole("button", { name: "Sign out" }).click();

    await page.goto("/login");
    await page.getByLabel("Email address").fill(email);
    await page.getByLabel("Password").fill("wrong-password");
    await page.getByRole("button", { name: "Sign in to Veloura" }).click();

    await expect(page).toHaveURL("/login");
    await expect(page.getByText("Incorrect email or password.")).toBeVisible();
  });

  test("registering with an already-used email shows a real error", async ({ page }) => {
    const { email } = await registerAndSignIn(page, "Shopper");
    await page.goto("/profile");
    await page.getByRole("button", { name: "Sign out" }).click();

    await page.goto("/register");
    await page.getByLabel("Full name").fill("Shopper Two");
    await page.getByLabel("Email address").fill(email);
    await page.getByLabel("Password").fill("Playwright123!");
    await page.getByRole("button", { name: /Create account/i }).click();

    await expect(page).toHaveURL("/register");
    await expect(page.getByText("An account with this email already exists.")).toBeVisible();
  });

  test("a logged-out visitor sees a sign-in link, not an account name", async ({ page }) => {
    await page.goto("/");
    await expect(
      page.getByRole("banner").getByRole("link", { name: "Sign in" }),
    ).toBeVisible();
  });

  test("the account menu surfaces every account/discover link and can sign out", async ({ page }) => {
    await registerAndSignIn(page, "Ada Lovelace");
    const trigger = page.getByRole("banner").getByRole("button", { name: /Ada/ });
    await trigger.click();

    const menu = page.getByRole("menu", { name: "Account" });
    await expect(menu).toBeVisible();
    for (const label of [
      "My Profile",
      "Wishlist",
      "Shopping Cart",
      "Your Orders",
      "For You",
      "AI Assistant",
      "Compare Products",
    ]) {
      await expect(menu.getByRole("menuitem", { name: label })).toBeVisible();
    }

    await menu.getByRole("menuitem", { name: "Sign out" }).click();
    await expect(page.getByRole("banner").getByRole("link", { name: "Sign in" })).toBeVisible();
  });

  test("the account menu closes on Escape and on an outside click", async ({ page }) => {
    await registerAndSignIn(page, "Ada Lovelace");
    const trigger = page.getByRole("banner").getByRole("button", { name: /Ada/ });

    await trigger.click();
    await expect(page.getByRole("menu", { name: "Account" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("menu", { name: "Account" })).toBeHidden();

    await trigger.click();
    await expect(page.getByRole("menu", { name: "Account" })).toBeVisible();
    await page.mouse.click(10, 10);
    await expect(page.getByRole("menu", { name: "Account" })).toBeHidden();
  });
});
