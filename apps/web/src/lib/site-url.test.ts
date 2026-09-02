import { describe, expect, it } from "vitest";
import { getSiteUrl } from "./site-url";

describe("getSiteUrl", () => {
  it("prefers the configured public site URL and normalizes it", () => {
    expect(
      getSiteUrl({
        configuredUrl: " https://veloura.example/store/ ",
        vercelProductionUrl: "fallback.vercel.app",
      }),
    ).toBe("https://veloura.example");
  });

  it("uses Vercel's production hostname when no custom URL is configured", () => {
    expect(getSiteUrl({ vercelProductionUrl: "veloura.vercel.app" })).toBe(
      "https://veloura.vercel.app",
    );
  });

  it("keeps a valid fallback when URL configuration is malformed", () => {
    expect(getSiteUrl({ configuredUrl: "not a URL" })).toBe(
      "https://web-lyart-three-94.vercel.app",
    );
  });
});
