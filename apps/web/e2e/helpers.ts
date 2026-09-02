import type { Locator, Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

/** Registers a fresh, randomly-suffixed account against the real apps/api and lands signed
 *  in on the home page. Used by specs that exercise the real cart/wishlist, which require a
 *  logged-in session (there is no guest cart in the real API). A random suffix avoids
 *  email collisions across repeated local runs against a persistent dev database.
 *
 *  `POST /auth/register` is rate-limited server-side (10/60s) — a real, intentional control,
 *  not something to weaken here. Several parallel Playwright workers each registering their
 *  own account can legitimately bump into it, so this retries with backoff on a genuine
 *  `ThrottlerException` rather than failing the whole test. */
export async function registerAndSignIn(
  page: Page,
  name = "E2E Shopper",
): Promise<{ email: string }> {
  const email = `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;

  for (let attempt = 1; attempt <= 4; attempt++) {
    await page.goto("/register");
    await page.getByLabel("Full name").fill(name);
    await page.getByLabel("Email address").fill(email);
    await page.getByLabel("Password").fill("Playwright123!");
    await page.getByRole("button", { name: /Create account/i }).click();

    try {
      await expect(page).toHaveURL("/", { timeout: 5000 });
      return { email };
    } catch (err) {
      const rateLimited = await page
        .getByText(/Too Many Requests/i)
        .isVisible()
        .catch(() => false);
      if (!rateLimited || attempt === 4) throw err;
      // The 60s throttle window needs real wall-clock time to clear. Waiting for the full
      // window keeps a real rate-limit response from becoming a flaky browser failure.
      test.slow();
      await page.waitForTimeout(60_000);
    }
  }
  throw new Error("unreachable");
}

export function availableProductLink(page: Page): Locator {
  return availableProductCard(page).locator('a[href^="/products/"]').first();
}

export function availableProductCard(page: Page): Locator {
  return page
    .getByTestId("catalog-product-card")
    .filter({ hasNotText: /Out of Stock/i })
    .first();
}
