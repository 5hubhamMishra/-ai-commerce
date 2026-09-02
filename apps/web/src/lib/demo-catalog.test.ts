import { afterEach, describe, expect, it, vi } from "vitest";

describe("demo catalog production boundary", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("does not expose fabricated catalog records in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.resetModules();

    const demoCatalog = await import("./demo-catalog");

    expect(demoCatalog.demoCategories).toEqual([]);
    expect(demoCatalog.demoBrands).toEqual([]);
    expect(demoCatalog.listDemoProducts()).toMatchObject({
      items: [],
      total: 0,
    });
    expect(demoCatalog.getDemoProductBySlug("anything")).toBeNull();
  });

  it("allows an explicit offline showcase opt-in", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_ALLOW_DEMO_FALLBACK", "true");
    vi.resetModules();

    const demoCatalog = await import("./demo-catalog");

    expect(demoCatalog.demoCategories.length).toBeGreaterThan(0);
    expect(demoCatalog.listDemoProducts().items.length).toBeGreaterThan(0);
  });
});
