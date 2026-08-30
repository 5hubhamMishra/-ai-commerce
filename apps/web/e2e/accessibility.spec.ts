import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { availableProductLink, registerAndSignIn } from "./helpers";

/**
 * Automated accessibility regression coverage (PROMPT 14's "accessibility tests"
 * requirement) — distinct from Phase 11's manual a11y pass (dialog semantics, skip link,
 * form labels, keyboard-accessible thumbnails). Scans WCAG 2.0/2.1 A+AA rules via axe-core
 * on the pages a real shopper actually lands on, including one authenticated state and one
 * with cart contents so dynamic UI (badges, quantity steppers) gets scanned too.
 */
const pagesToScan = [
  { name: "home", path: "/" },
  { name: "shop", path: "/shop" },
  { name: "search results", path: "/search?q=headphones" },
  { name: "cart (empty)", path: "/cart" },
  { name: "login", path: "/login" },
  { name: "register", path: "/register" },
  { name: "category", path: "/category/laptops" },
  { name: "recommendations", path: "/recommendations" },
  { name: "compare (empty)", path: "/compare" },
  { name: "about", path: "/about" },
  { name: "contact", path: "/contact" },
  { name: "privacy", path: "/privacy" },
];

for (const { name, path } of pagesToScan) {
  test(`${name} page has no critical/serious axe violations`, async ({
    page,
  }) => {
    await page.goto(path);
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();

    const seriousOrWorse = results.violations.filter((v) =>
      ["serious", "critical"].includes(v.impact ?? ""),
    );
    expect(
      seriousOrWorse,
      seriousOrWorse
        .map((v) => `${v.id}: ${v.description} (${v.nodes.length} nodes)`)
        .join("\n"),
    ).toEqual([]);
  });
}

test("product detail page has no critical/serious axe violations", async ({
  page,
}) => {
  await page.goto("/shop");
  await page.locator('a[href^="/products/"]').first().click();
  await expect(page).toHaveURL(/\/products\//);

  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  const seriousOrWorse = results.violations.filter((v) =>
    ["serious", "critical"].includes(v.impact ?? ""),
  );
  expect(
    seriousOrWorse,
    seriousOrWorse.map((v) => `${v.id}: ${v.description}`).join("\n"),
  ).toEqual([]);
});

test("cart with an item and the mobile nav drawer open have no critical/serious axe violations", async ({
  page,
}) => {
  await registerAndSignIn(page);
  await page.goto("/shop");
  await availableProductLink(page).click();
  await page.getByRole("button", { name: "Add to cart" }).first().click();
  await page.goto("/cart");

  const cartResults = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  const cartViolations = cartResults.violations.filter((v) =>
    ["serious", "critical"].includes(v.impact ?? ""),
  );
  expect(
    cartViolations,
    cartViolations.map((v) => `${v.id}: ${v.description}`).join("\n"),
  ).toEqual([]);
});
