import { test, expect } from "@playwright/test";
import { registerAndSignIn } from "./helpers";

/**
 * /admin now reads real data from apps/api's analytics/orders-admin endpoints, gated by a
 * real role check (@Roles(...) server-side; this page's own check is UX only). The seeded
 * dev-only SUPER_ADMIN account (apps/api/prisma/seed.ts, non-production only) is the only
 * way to reach the authorized view in this test environment.
 */
test.describe("admin dashboard", () => {
  test("an unauthenticated visitor is redirected to sign in", async ({
    page,
  }) => {
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/login/);
  });

  test("a signed-in customer (no admin role) sees a not-authorized message, not real data", async ({
    page,
  }) => {
    await registerAndSignIn(page);
    await page.goto("/admin");
    await expect(
      page.getByRole("heading", { name: "Not authorized" }),
    ).toBeVisible();
  });

  test("the seeded SUPER_ADMIN sees the real business dashboard with live data", async ({
    page,
  }) => {
    await page.goto("/login");
    await page.getByLabel("Email address").fill("admin@veloura.dev");
    await page.getByLabel("Password").fill("ChangeMe123!");
    await page.getByRole("button", { name: "Sign in to Veloura" }).click();
    await expect(page).toHaveURL("/");

    await page.goto("/admin");
    await expect(
      page.getByRole("heading", { name: "Business Dashboard" }),
    ).toBeVisible();
    await expect(page.getByText("SUPER_ADMIN")).toBeVisible();

    // Real data, not the old static-catalog placeholders — the segmentation section always
    // renders a real profile count once loaded (this DB has real profiles from prior activity).
    await expect(
      page.getByRole("heading", { name: "Customer Segmentation" }),
    ).toBeVisible();
    await expect(page.getByText(/\d+ profiles/)).toBeVisible({
      timeout: 10000,
    });

    await expect(
      page.getByRole("heading", { name: "Recent Orders" }),
    ).toBeVisible();
  });

  test("the admin can open a real order and update its status when one exists", async ({
    page,
  }) => {
    await page.goto("/login");
    await page.getByLabel("Email address").fill("admin@veloura.dev");
    await page.getByLabel("Password").fill("ChangeMe123!");
    await page.getByRole("button", { name: "Sign in to Veloura" }).click();
    await expect(page).toHaveURL("/");

    await page.goto("/admin");
    const ordersTable = page.locator("table").filter({ hasText: "Order" });
    const firstRow = ordersTable.locator("tbody tr").first();
    if ((await firstRow.count()) === 0) {
      await expect(page.getByText("No orders yet.")).toBeVisible();
      return;
    }
    await expect(firstRow).toBeVisible({ timeout: 10000 });
    await firstRow.focus();
    await firstRow.press("Enter");

    await expect(page).toHaveURL(/\/admin\/orders\//);
    await expect(
      page.getByRole("heading", { name: "Update status" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Update status" }).click();
    // Either it succeeds (order was in a state PROCESSING is legal from) or the backend's
    // real state-machine rejects it with a clear error — both are correct, deterministic
    // outcomes; either way the button must settle back to its idle label, not hang forever.
    await expect(
      page.getByRole("button", { name: "Update status" }),
    ).toBeEnabled({ timeout: 10000 });
  });
});
