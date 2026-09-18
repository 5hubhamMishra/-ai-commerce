import { describe, expect, it } from "vitest";
import { GET } from "./route";

describe("public OpenAPI resource", () => {
  it("publishes a parseable, public-only specification with unique operation ids", async () => {
    const response = GET();
    const document = await response.json();
    const operations = Object.values(document.paths).flatMap((path) =>
      Object.values(path as Record<string, { operationId?: string }>),
    );
    const operationIds = operations
      .map((operation) => operation.operationId)
      .filter((value): value is string => Boolean(value));

    expect(response.headers.get("content-type")).toContain("application/json");
    expect(document.openapi).toBe("3.1.0");
    expect(document.info.title).toBe("Veloura public API");
    expect(operationIds.length).toBeGreaterThan(0);
    expect(new Set(operationIds).size).toBe(operationIds.length);
    expect(document.paths["/products"].get.operationId).toBe(
      "listPublicProducts",
    );
    expect(document.paths["/payments"]).toBeUndefined();
    expect(document.paths["/admin"]).toBeUndefined();
  });
});
