import { afterEach, describe, expect, it, vi } from "vitest";
import { createDemoShopAIReply } from "./demo-shopai";

describe("ShopAI demo fallback boundary", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("does not fabricate a reply or products in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_ALLOW_DEMO_FALLBACK", "");

    const reply = createDemoShopAIReply([
      { role: "user", content: "laptop for coding under 80000" },
    ]);

    expect(reply.products).toEqual([]);
    expect(reply.content).toContain("live catalog is temporarily unavailable");
  });
});
