import { describe, expect, it } from "vitest";
import { safeJsonLd } from "./jsonLd";

describe("safeJsonLd", () => {
  it("escapes </script> so it can't break out of the surrounding script tag", () => {
    const malicious = { name: 'Evil</script><script>alert(1)</script>' };
    const output = safeJsonLd(malicious);
    expect(output).not.toContain("</script>");
    expect(JSON.parse(output.replace(/\\u003c/g, "<"))).toEqual(malicious);
  });

  it("produces valid, parseable JSON for ordinary data", () => {
    const data = { "@type": "Product", name: "Wireless Headphones", price: 1999 };
    expect(JSON.parse(safeJsonLd(data))).toEqual(data);
  });
});
