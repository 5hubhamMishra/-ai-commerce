import { expect, request, test } from "@playwright/test";

// A trailing slash on baseURL plus no leading slash on each call's path is required together
// for Playwright's URL-merge rules to keep the /api/v1 segment — either alone drops it (a
// leading slash resolves against the origin root; a bare-non-trailing-slash base drops its
// own last path segment when merging), which is what actually broke this test the first time.
// 127.0.0.1, not localhost: apps/api only binds the IPv4 loopback, but Playwright's
// APIRequestContext resolves "localhost" to the IPv6 ::1 first on this machine and gets
// ECONNREFUSED — a separate bug from the one above, found immediately after fixing it.
const API_BASE = `${process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:4000/api/v1"}/`;
const PASSWORD = "Playwright123!";

/**
 * The one part of this flow with no UI path at all (advancing a real order through the
 * admin fulfillment state machine to DELIVERED) is driven directly against the real API,
 * exactly like apps/api's own e2e suite does — same endpoints, same sequence. Everything
 * this spec actually cares about verifying (writing a review, seeing it on the product
 * page) happens in a real browser against the real running app.
 */
test.describe("product reviews", () => {
  test("a customer can review a delivered product, and the review shows up on the product page", async ({
    page,
  }) => {
    const api = await request.newContext({ baseURL: API_BASE });
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const email = `e2e-review-${suffix}@example.com`;

    const register = await api.post("auth/register", {
      data: { email, password: PASSWORD, name: "Review Playwright Shopper" },
    });
    expect(register.ok()).toBe(true);
    const { accessToken } = (await register.json()) as { accessToken: string };
    const authHeaders = { Authorization: `Bearer ${accessToken}` };

    const admin = await api.post("auth/login", {
      data: { email: "admin@veloura.dev", password: "ChangeMe123!" },
    });
    expect(admin.ok()).toBe(true);
    const { accessToken: adminToken } = (await admin.json()) as {
      accessToken: string;
    };
    const adminHeaders = { Authorization: `Bearer ${adminToken}` };

    const products = await api.get("products?page=1&pageSize=100");
    expect(products.ok()).toBe(true);
    const productList = (await products.json()) as {
      items: { slug: string; name: string; inStock: boolean }[];
    };
    const productSlug = productList.items.find((item) => item.inStock)?.slug;
    expect(productSlug).toEqual(expect.any(String));

    const product = await api.get(`products/${productSlug}`);
    expect(product.ok()).toBe(true);
    const productBody = (await product.json()) as {
      variants: { id: string; availableQuantity: number }[];
    };
    const variant = productBody.variants.find((v) => v.availableQuantity > 0);
    if (!variant) throw new Error(`No purchasable variant for ${productSlug}`);

    const address = await api.post("addresses", {
      headers: authHeaders,
      data: {
        line1: "221B Baker Street",
        city: "Mumbai",
        state: "Maharashtra",
        postalCode: "400001",
        country: "India",
      },
    });
    expect(address.ok()).toBe(true);
    const { id: addressId } = (await address.json()) as { id: string };

    const cart = await api.post("cart/items", {
      headers: authHeaders,
      data: { variantId: variant.id, quantity: 1 },
    });
    expect(cart.ok()).toBe(true);

    const order = await api.post("orders", {
      headers: { ...authHeaders, "Idempotency-Key": `review-order-${suffix}` },
      data: { addressId, shippingMethod: "STANDARD" },
    });
    expect(order.ok()).toBe(true);
    const { id: orderId } = (await order.json()) as { id: string };

    const payment = await api.post("payments", {
      headers: { ...authHeaders, "Idempotency-Key": `review-pay-${suffix}` },
      data: { orderId },
    });
    expect(payment.ok()).toBe(true);
    const { paymentId } = (await payment.json()) as { paymentId: string };

    const confirm = await api.post(`payments/${paymentId}/confirm`, {
      headers: {
        ...authHeaders,
        "Idempotency-Key": `review-confirm-${suffix}`,
      },
      data: {},
    });
    expect(confirm.ok()).toBe(true);

    for (const status of ["PROCESSING", "PACKED"]) {
      const res = await api.patch(`orders/admin/${orderId}/status`, {
        headers: adminHeaders,
        data: { status },
      });
      expect(res.ok()).toBe(true);
    }
    const shipped = await api.patch(`orders/admin/${orderId}/status`, {
      headers: adminHeaders,
      data: {
        status: "SHIPPED",
        carrier: "BlueDart",
        trackingNumber: `TRK-${suffix}`,
      },
    });
    expect(shipped.ok()).toBe(true);
    for (const status of ["OUT_FOR_DELIVERY", "DELIVERED"]) {
      const res = await api.patch(`orders/admin/${orderId}/status`, {
        headers: adminHeaders,
        data: { status },
      });
      expect(res.ok()).toBe(true);
    }

    // Real browser interaction from here on.
    await page.goto("/login");
    await page.getByLabel("Email address").fill(email);
    await page.getByLabel("Password").fill(PASSWORD);
    await page.getByRole("button", { name: "Sign in to Veloura" }).click();
    await expect(page).toHaveURL("/");

    // Unique per run: this hits a real, persistent dev database with no reset between runs,
    // and a fixed string would collide with every prior local run's review on this product.
    const reviewTitle = `Genuinely great ${suffix}`;
    const reviewBody = `Exactly as described, arrived on time. (${suffix})`;

    await page.goto(`/orders/${orderId}`);
    await expect(page.getByText("Delivered").first()).toBeVisible();
    await page.getByRole("button", { name: "Write a review" }).click();
    await page.getByRole("radio", { name: "5 stars" }).click();
    await page.getByPlaceholder("Title (optional)").fill(reviewTitle);
    await page
      .getByPlaceholder("Share your thoughts (optional)")
      .fill(reviewBody);
    await page.getByRole("button", { name: "Submit review" }).click();
    await expect(page.getByText("Thanks for your review")).toBeVisible();

    await page.goto(`/products/${productSlug}`);
    await expect(page.getByText(reviewTitle)).toBeVisible();
    await expect(page.getByText(reviewBody)).toBeVisible();
    await expect(page.getByText("Verified purchase").first()).toBeVisible();
    await expect(
      page.getByText("Review Playwright Shopper").first(),
    ).toBeVisible();
  });
});
