import { expect, test, type Page } from "@playwright/test";

/**
 * Responsive coverage (master refinement prompt section 35): checks for the single most
 * common and highest-value responsive defect — horizontal overflow forcing an unwanted
 * scrollbar — at the breakpoints the prompt names. A full 9-breakpoint sweep runs only on
 * the pages most prone to overflow (hero/grids/galleries/filters); everything else public
 * gets a lighter 3-point check (smallest phone, tablet, large desktop).
 */
const FULL_BREAKPOINTS = [320, 375, 390, 430, 768, 1024, 1280, 1440, 1920];
const SPOT_BREAKPOINTS = [320, 768, 1920];

async function expectNoHorizontalOverflow(page: Page, context: string) {
  const overflow = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(
    overflow.scrollWidth,
    `${context}: document is ${overflow.scrollWidth}px wide but viewport is ${overflow.clientWidth}px`,
  ).toBeLessThanOrEqual(overflow.clientWidth);
}

const fullSweepPages = [
  { name: "home", path: "/" },
  { name: "shop", path: "/shop" },
];

for (const { name, path } of fullSweepPages) {
  for (const width of FULL_BREAKPOINTS) {
    test(`${name} page has no horizontal overflow at ${width}px`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(path);
      await expectNoHorizontalOverflow(page, `${name} at ${width}px`);
    });
  }
}

for (const width of FULL_BREAKPOINTS) {
  test(`product detail page has no horizontal overflow at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/shop");
    await page.locator('a[href^="/products/"]').first().click();
    await expect(page).toHaveURL(/\/products\//);
    await expectNoHorizontalOverflow(page, `product detail at ${width}px`);
  });
}

const spotCheckPages = [
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
  { name: "ai-shopping", path: "/ai-shopping" },
  { name: "checkout (empty cart)", path: "/checkout" },
];

for (const { name, path } of spotCheckPages) {
  for (const width of SPOT_BREAKPOINTS) {
    test(`${name} page has no horizontal overflow at ${width}px`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(path);
      await expectNoHorizontalOverflow(page, `${name} at ${width}px`);
    });
  }
}
