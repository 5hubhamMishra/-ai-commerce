import { describe, expect, it } from "vitest";
import { parseQuery, searchProducts } from "./search";
import { categories } from "./data";

describe("parseQuery", () => {
  it('extracts a "under X" budget as maxPrice', () => {
    expect(parseQuery("headphones under 5000").maxPrice).toBe(5000);
  });

  it('extracts a "under Xk" budget in thousands', () => {
    expect(parseQuery("laptop under 50k").maxPrice).toBe(50000);
  });

  it('extracts an "over X" budget as minPrice', () => {
    expect(parseQuery("camera over 20000").minPrice).toBe(20000);
  });

  it("extracts a range as both min and max price", () => {
    const parsed = parseQuery("5000-10000 headphones");
    expect(parsed.minPrice).toBe(5000);
    expect(parsed.maxPrice).toBe(10000);
  });

  it("detects a real category name from the live catalog data", () => {
    const categoryName = categories[0].name;
    const parsed = parseQuery(`show me some ${categoryName.toLowerCase()}`);
    expect(parsed.category).toBe(categoryName);
  });

  it("detects a category via a known alias", () => {
    // Deliberately avoids the word "noise" — "Noise" is a real seeded brand catalogued
    // under Wearables, and the brand-match loop runs before the alias loop, so a phrase
    // like "noise cancelling earbud" resolves to Wearables via that brand collision, not
    // the "earbud" -> Headphones alias this test means to exercise.
    expect(parseQuery("a comfortable earbud for commuting").category).toBe("Headphones");
  });

  it("detects a use-case phrase", () => {
    expect(parseQuery("something good for gaming").useCase).toBe("gaming");
  });

  it("drops short stop words from keywords", () => {
    const parsed = parseQuery("the best one for the money");
    expect(parsed.keywords).not.toContain("the");
    expect(parsed.keywords).not.toContain("for");
  });

  it("returns an empty ParsedQuery for a query with no signal", () => {
    const parsed = parseQuery("hmm");
    expect(parsed.category).toBeUndefined();
    expect(parsed.maxPrice).toBeUndefined();
  });
});

describe("searchProducts", () => {
  it("returns an empty array for a blank query", () => {
    expect(searchProducts("   ")).toEqual([]);
  });

  it("finds real products by category name", () => {
    const categoryName = categories[0].name;
    const results = searchProducts(categoryName);
    expect(results.length).toBeGreaterThan(0);
    expect(results.every((p) => p.category === categoryName)).toBe(true);
  });

  it("respects a max-price budget constraint by ranking cheaper matches above it, and never returns an unrelated category just because it's within budget", () => {
    const results = searchProducts("laptop under 100000");
    expect(results.length).toBeGreaterThan(0);
    expect(results.every((p) => p.category === "Laptops")).toBe(true);

    const withinBudget = results.filter((p) => p.price <= 100000);
    const overBudget = results.filter((p) => p.price > 100000);
    expect(withinBudget.length).toBeGreaterThan(0);
    expect(overBudget.length).toBeGreaterThan(0);
    expect(results.indexOf(withinBudget[0])).toBeLessThan(
      results.indexOf(overBudget[0]),
    );
  });

  it("a pure budget query (no category/brand/keywords) legitimately matches across categories", () => {
    const results = searchProducts("under 3000");
    expect(results.length).toBeGreaterThan(0);
    expect(results.every((p) => p.price <= 3000)).toBe(true);
    const categoriesSeen = new Set(results.map((p) => p.category));
    expect(categoriesSeen.size).toBeGreaterThan(1);
  });

  it("respects the limit parameter", () => {
    const results = searchProducts("a", 3);
    expect(results.length).toBeLessThanOrEqual(3);
  });

  it("returns nothing for pure gibberish with no matching keywords or category", () => {
    expect(searchProducts("zzxxqqxyzznonexistentgarble")).toEqual([]);
  });
});
