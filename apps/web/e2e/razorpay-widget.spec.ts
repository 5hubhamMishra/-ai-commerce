import { expect, test } from "@playwright/test";
import { availableProductLink, registerAndSignIn } from "./helpers";

const runRazorpayWidgetSmoke = process.env.RUN_RAZORPAY_WIDGET_E2E === "1";
const hasBrowserKey = Boolean(process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID);

test.describe("Razorpay Checkout widget smoke", () => {
  test.skip(
    !runRazorpayWidgetSmoke || !hasBrowserKey,
    "Set RUN_RAZORPAY_WIDGET_E2E=1 plus NEXT_PUBLIC_RAZORPAY_KEY_ID, and run the API with PAYMENT_PROVIDER=razorpay.",
  );

  test("creates a real Razorpay order and opens the Checkout.js widget", async ({
    page,
  }) => {
    await registerAndSignIn(page, "Razorpay E2E Shopper");

    await page.goto("/shop");
    await availableProductLink(page).click();
    await page.getByRole("button", { name: "Add to cart" }).first().click();
    await expect(
      page.getByRole("button", { name: /Added to cart/ }),
    ).toBeVisible();

    await page.goto("/checkout");
    await page
      .getByPlaceholder("House no, building, street")
      .fill("221B Baker Street");
    await page.getByPlaceholder("City").fill("Mumbai");
    await page.getByPlaceholder("State").fill("Maharashtra");
    await page.getByPlaceholder("PIN code").fill("400001");
    await page.getByRole("button", { name: "Save address" }).click();

    await expect(page.getByText("Secure payment via Razorpay")).toBeVisible();
    await expect(page.getByRole("button", { name: /Place order/ })).toBeEnabled(
      { timeout: 10000 },
    );

    const paymentResponsePromise = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        /\/api\/v1\/payments$/.test(new URL(response.url()).pathname),
    );

    await page.getByRole("button", { name: /Place order/ }).click();

    const paymentResponse = await paymentResponsePromise;
    expect(paymentResponse.ok()).toBe(true);
    const payment = (await paymentResponse.json()) as { providerRef?: string };
    expect(payment.providerRef).toMatch(/^order_/);

    await expect(
      page
        .locator(
          'iframe.razorpay-checkout-frame, iframe[src*="razorpay"], .razorpay-container',
        )
        .first(),
    ).toBeVisible({ timeout: 15000 });
  });
});
