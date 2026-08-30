import { describe, expect, it } from "vitest";
import { safeRedirectPath } from "./safeRedirect";

describe("safeRedirectPath", () => {
  it("allows a plain internal path", () => {
    expect(safeRedirectPath("/products/some-slug")).toBe("/products/some-slug");
  });

  it("falls back to / when there's no value", () => {
    expect(safeRedirectPath(null)).toBe("/");
    expect(safeRedirectPath("")).toBe("/");
  });

  it("rejects a fully-qualified external URL", () => {
    expect(safeRedirectPath("https://evil.example/phish")).toBe("/");
  });

  it("rejects a protocol-relative URL (browser-normalized to an external origin)", () => {
    expect(safeRedirectPath("//evil.example/phish")).toBe("/");
  });

  it("rejects the backslash-as-slash bypass", () => {
    expect(safeRedirectPath("/\\evil.example")).toBe("/");
  });

  it("rejects a path with no leading slash", () => {
    expect(safeRedirectPath("evil.example")).toBe("/");
  });
});
