import { describe, expect, it } from "vitest";
import { formatPrice } from "./format";

describe("formatPrice", () => {
  it("formats a whole-rupee amount with the ₹ symbol and no decimals", () => {
    expect(formatPrice(1999)).toBe("₹1,999");
  });

  it("rounds to the nearest rupee (no fraction digits)", () => {
    expect(formatPrice(999.6)).toBe("₹1,000");
  });

  it("formats zero", () => {
    expect(formatPrice(0)).toBe("₹0");
  });

  it("uses Indian digit grouping for large amounts", () => {
    expect(formatPrice(1234567)).toBe("₹12,34,567");
  });
});
