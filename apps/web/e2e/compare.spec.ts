import { test, expect } from "@playwright/test";

/**
 * /compare now calls apps/api's real GET /comparison (public, 2-4 product ids, returns a
 * grouped spec matrix) instead of deriving everything from the static fake catalog. Which
 * ids are selected stays client-local state — that's the real endpoint's own intended
 * design (stateless, no server-side "compare tray").
 */
test.describe("compare", () => {
  test("shows an empty state with no products selected", async ({ page }) => {
    await page.goto("/compare");
    await expect(page.getByText("No products selected")).toBeVisible();
  });

  test("searching finds real products, and one selected product prompts for a second", async ({ page }) => {
    await page.goto("/compare");
    await page.getByPlaceholder("Search a product to add...").fill("a");
    await expect(page.getByRole("listbox")).toBeVisible({ timeout: 10000 });

    await page.getByRole("option").first().click();
    await expect(page.getByText("Add one more product")).toBeVisible();
  });

  test("comparing two real products shows a real spec matrix", async ({ page }) => {
    await page.goto("/compare");
    const input = page.getByPlaceholder("Search a product to add...");

    await input.fill("a");
    await expect(page.getByRole("listbox")).toBeVisible({ timeout: 10000 });
    const firstName = await page.getByRole("option").first().locator("span").first().textContent();
    await page.getByRole("option").first().click();

    await input.fill("e");
    await expect(page.getByRole("listbox")).toBeVisible({ timeout: 10000 });
    await page.getByRole("option").first().click();

    await expect(page.locator("table")).toBeVisible({ timeout: 10000 });
    if (firstName) await expect(page.getByText(firstName.trim())).toBeVisible();
    await expect(page.getByRole("button", { name: "Remove" }).first()).toBeVisible();
  });

  test("removing a product drops back below the 2-product minimum", async ({ page }) => {
    await page.goto("/compare");
    const input = page.getByPlaceholder("Search a product to add...");

    await input.fill("a");
    await expect(page.getByRole("listbox")).toBeVisible({ timeout: 10000 });
    await page.getByRole("option").first().click();

    await input.fill("e");
    await expect(page.getByRole("listbox")).toBeVisible({ timeout: 10000 });
    await page.getByRole("option").first().click();

    await expect(page.locator("table")).toBeVisible({ timeout: 10000 });
    await page.getByRole("button", { name: "Remove" }).first().click();

    await expect(page.getByText("Add one more product")).toBeVisible();
  });
});
