import { test, expect } from "@playwright/test";

/**
 * ShopAI is now the real, Anthropic-backed assistant in apps/api (POST /shopai/message) —
 * it can no longer be tested by asserting on exact reply phrasing (that was only true of
 * the old client-side rule-based `respond()`, since removed). Most tests here mock the
 * network response instead, so they verify apps/web's own behavior (rendering, loading
 * state, conversation-id continuity, error handling) deterministically, independent of
 * real LLM output or apps/api's current Anthropic account balance.
 */
test.describe("ShopAI chat", () => {
  test("sending a message shows it immediately, then renders the real assistant reply", async ({ page }) => {
    await page.route("**/shopai/message", (route) =>
      route.fulfill({
        json: {
          conversationId: "e2e-conv-1",
          message: { role: "assistant", content: "Here are a few laptops that fit a coding/ML workload under 80,000." },
          toolActivity: [{ name: "search_products" }],
        },
      }),
    );

    await page.goto("/ai-shopping");
    const input = page.getByPlaceholder("Ask ShopAI anything...");
    await input.fill("a laptop for coding and machine learning under 80000");
    await page.getByRole("button", { name: "Send" }).click();

    await expect(page.getByText("a laptop for coding and machine learning under 80000")).toBeVisible();
    await expect(page.getByText("Here are a few laptops that fit a coding/ML workload under 80,000.")).toBeVisible({
      timeout: 5000,
    });
  });

  test("a second message carries the conversation id the first reply returned", async ({ page }) => {
    let requestCount = 0;
    await page.route("**/shopai/message", async (route) => {
      requestCount += 1;
      const body = route.request().postDataJSON() as { conversationId?: string };
      if (requestCount === 1) {
        expect(body.conversationId).toBeUndefined();
      } else {
        expect(body.conversationId).toBe("e2e-conv-2");
      }
      await route.fulfill({
        json: {
          conversationId: "e2e-conv-2",
          message: { role: "assistant", content: `reply ${requestCount}` },
          toolActivity: [],
        },
      });
    });

    await page.goto("/ai-shopping");
    const input = page.getByPlaceholder("Ask ShopAI anything...");
    await input.fill("hello");
    await page.getByRole("button", { name: "Send" }).click();
    await expect(page.getByText("reply 1")).toBeVisible({ timeout: 5000 });

    await input.fill("and again");
    await page.getByRole("button", { name: "Send" }).click();
    await expect(page.getByText("reply 2")).toBeVisible({ timeout: 5000 });

    expect(requestCount).toBe(2);
  });

  test("a failed request surfaces a visible error instead of hanging silently", async ({ page }) => {
    await page.route("**/shopai/message", (route) =>
      route.fulfill({
        status: 500,
        json: { error: { code: "INTERNAL_SERVER_ERROR", message: "Something went wrong. Please try again.", requestId: "e2e-req-1", details: {} } },
      }),
    );

    await page.goto("/ai-shopping");
    const input = page.getByPlaceholder("Ask ShopAI anything...");
    await input.fill("what do you sell");
    await page.getByRole("button", { name: "Send" }).click();

    await expect(page.getByText("Something went wrong. Please try again.")).toBeVisible({ timeout: 5000 });
    await expect(page.getByText("ShopAI — couldn't reply")).toBeVisible();
  });

  test("a starter chip sends its own text as the first message", async ({ page }) => {
    await page.route("**/shopai/message", (route) =>
      route.fulfill({
        json: { conversationId: "e2e-conv-3", message: { role: "assistant", content: "Sure — here's what I found." }, toolActivity: [] },
      }),
    );

    await page.goto("/ai-shopping");
    await page.getByRole("button", { name: /Running shoes under 10000/ }).click();

    await expect(page.getByText("Running shoes under 10000", { exact: false })).toBeVisible();
    await expect(page.getByText("Sure — here's what I found.")).toBeVisible({ timeout: 5000 });
  });

  test("a real message against the live backend gets a response — either a real reply or a clear error, never a silent hang", async ({
    page,
  }) => {
    // Unmocked — exercises the actual apps/api round trip (auth-optional, conversation
    // creation, real Anthropic call). Accepts either outcome rather than asserting reply
    // content, since the account behind this key may or may not have credit at any given
    // time — that's a billing concern outside this test's scope, not a UI bug.
    await page.goto("/ai-shopping");
    const input = page.getByPlaceholder("Ask ShopAI anything...");
    await input.fill("what categories do you sell?");
    await page.getByRole("button", { name: "Send" }).click();

    const assistantReply = page.locator(".whitespace-pre-line").last();
    await expect(assistantReply).toBeVisible({ timeout: 20000 });
    await expect(assistantReply).not.toBeEmpty();
  });
});
