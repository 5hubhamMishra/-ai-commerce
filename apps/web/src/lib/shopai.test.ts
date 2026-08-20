import { describe, expect, it } from "vitest";
import { respond, type AssistantTurn } from "./shopai";
import { products, categories } from "./data";
import type { CustomerProfile } from "./types";

const emptyProfile: CustomerProfile = {
  categoryAffinity: {},
  brandAffinity: {},
  priceRangeMin: 0,
  priceRangeMax: 0,
  segment: "new",
  lifecycleStage: "browsing",
  intentConfidence: 0,
  currentIntent: null,
};

const footwearProduct = products.find((p) => p.category === "Footwear")!;
const groceryProduct = products.find((p) => p.category === "Groceries")!;

function shownTurn(product = footwearProduct): AssistantTurn {
  return { role: "assistant", text: "here you go", products: [product] };
}

describe("respond — answering a direct question, not just listing", () => {
  it("answers a spec question about the last-shown product by value, not a card dump", () => {
    const reply = respond("what is the sole type", [shownTurn()], emptyProfile);
    expect(reply.text).toContain("Sole Type");
    expect(reply.text).toContain(footwearProduct.specs["Sole Type"]);
    expect(reply.products).toEqual([footwearProduct]);
  });

  it("answers a yes/no feature question using the real spec value", () => {
    const reply = respond("does it have a leather upper", [shownTurn()], emptyProfile);
    expect(reply.text).toMatch(/^Yes —/);
    expect(reply.text).toContain(footwearProduct.specs["Upper Material"]);
  });

  it("answers a price question directly, including the discount if there is one", () => {
    const reply = respond("how much does it cost", [shownTurn()], emptyProfile);
    expect(reply.text).toContain(footwearProduct.name);
    expect(reply.text).toMatch(/₹/);
  });

  it("answers a stock question directly", () => {
    const reply = respond("is it in stock", [shownTurn()], emptyProfile);
    expect(reply.text.toLowerCase()).toMatch(/stock|available/);
  });

  it("resolves a product named directly in the message, even with nothing shown yet", () => {
    const nameWords = groceryProduct.name.split(" ").slice(0, 3).join(" ");
    const reply = respond(`what is the shelf life of the ${nameWords}`, [], emptyProfile);
    expect(reply.text).toContain("Shelf Life");
    expect(reply.text).toContain(groceryProduct.specs["Shelf Life"]);
  });

  it("does not misidentify a product from brand overlap alone (regression: duplicate brand-word scoring)", () => {
    // The brand name is repeated inside many product names (e.g. "Amul" the brand vs.
    // "Amul Peanut Butter Everyday" the name) — a naive word-overlap count double-counts
    // that single shared word and can cross the confidence threshold on brand alone.
    const reply = respond("what is the shelf life of the Amul cooking oil", [], emptyProfile);
    // No real "Amul cooking oil" exists in the catalog, so this must not confidently
    // answer about an unrelated Amul product — it should fall through to a real search.
    expect(reply.text).not.toMatch(/^Shelf Life on the Amul/);
  });

  it("answers a catalog-overview question with the real category list, not a description of whatever was last shown (regression)", () => {
    // Live bug: "tell me the type of items that are listed on the site" got routed
    // through the "tell me about it" product-summary branch and answered about whatever
    // product happened to be on screen (a laptop), instead of actually answering the
    // question asked.
    const reply = respond(
      "tell me the type of items that are listed on the site",
      [shownTurn()],
      emptyProfile
    );
    expect(reply.products).toBeUndefined();
    for (const c of categories) {
      expect(reply.text).toContain(c.name);
    }
  });

  it("a bare 'tell me ...' about something unrelated to the shown product does not describe that product", () => {
    const reply = respond("tell me a joke", [shownTurn()], emptyProfile);
    expect(reply.text).not.toContain(footwearProduct.name);
  });

  it("'tell me more' after a product was shown still gives that product's real summary", () => {
    const reply = respond("tell me more", [shownTurn()], emptyProfile);
    expect(reply.text).toContain(footwearProduct.name);
    expect(reply.products).toEqual([footwearProduct]);
  });

  it("still falls through to a real search for a genuinely new query after a product was shown", () => {
    const reply = respond("recommend a formal shirt under 3000", [shownTurn()], emptyProfile);
    expect(reply.products?.every((p) => p.category === "Shirts")).toBe(true);
    // Budget is a ranking signal, not a hard filter (searchProducts ranks within-budget
    // matches above over-budget ones rather than excluding them — see search.test.ts) —
    // so only the top pick is guaranteed to respect it, not every returned item.
    expect(reply.products![0].price).toBeLessThanOrEqual(3000);
  });

  it("answers a store policy question instead of running a doomed product search", () => {
    const reply = respond("what is your shipping policy", [], emptyProfile);
    expect(reply.text).toMatch(/free.*5,000|5,000.*free/i);
    expect(reply.products).toBeUndefined();
  });
});

describe("respond — search fallback gives a real recommendation, not a generic listing", () => {
  it("names a specific top pick with a stated reason, not just 'here is what matches'", () => {
    const reply = respond("show me some running shoes", [], emptyProfile);
    expect(reply.products?.length).toBeGreaterThan(0);
    expect(reply.products![0].category).toBe("Footwear");
    expect(reply.text).toContain(reply.products![0].name);
    // The old generic phrasing this replaced — must not regress back to it.
    expect(reply.text).not.toMatch(/^here's what matches best/i);
  });
});
