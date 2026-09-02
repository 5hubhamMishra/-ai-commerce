import { describe, expect, it } from "vitest";
import { shouldUseDemoCatalog } from "./demo-catalog";

describe("demo catalog production boundary", () => {
  it("disables fabricated records in production by default", () => {
    expect(shouldUseDemoCatalog("production", "")).toBe(false);
  });

  it("allows an explicit offline showcase opt-in", () => {
    expect(shouldUseDemoCatalog("production", "true")).toBe(true);
    expect(shouldUseDemoCatalog("development", undefined)).toBe(true);
  });
});
