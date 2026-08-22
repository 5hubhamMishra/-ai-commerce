import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, configureApiClient, request } from "@ai-commerce/api-client";

/** Covers packages/api-client/src/http.ts's error mapping and 401-refresh-retry logic
 *  directly — this lives in apps/web (the only place Vitest is wired up in this monorepo)
 *  rather than as a colocated package-level test, since packages/api-client has no test
 *  runner of its own. */

function jsonResponse(status: number, body: unknown): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
}

function pathOf(input: RequestInfo | URL): string {
  return new URL(typeof input === "string" ? input : input.toString()).pathname;
}

describe("api-client http", () => {
  let accessToken: string | null;
  let onAuthExpiredCalls: number;

  beforeEach(() => {
    accessToken = "initial-token";
    onAuthExpiredCalls = 0;
    configureApiClient({
      getAccessToken: () => accessToken,
      setAccessToken: (t) => {
        accessToken = t;
      },
      onAuthExpired: () => {
        onAuthExpiredCalls++;
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("maps a non-2xx error envelope to a typed ApiError", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse(404, {
          error: { code: "PRODUCT_NOT_FOUND", message: "Product not found.", requestId: "req-1", details: {} },
        }),
      ),
    );

    await expect(request("/products/missing")).rejects.toBeInstanceOf(ApiError);
    await expect(request("/products/missing")).rejects.toMatchObject({
      code: "PRODUCT_NOT_FOUND",
      message: "Product not found.",
      requestId: "req-1",
      status: 404,
    });
  });

  it("on a 401, refreshes once and retries the original request", async () => {
    let cartCalls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const path = pathOf(input);
        if (path.endsWith("/auth/refresh")) {
          return jsonResponse(200, { accessToken: "new-token", refreshToken: "r2" });
        }
        if (path.endsWith("/cart")) {
          cartCalls++;
          if (cartCalls === 1) {
            return jsonResponse(401, {
              error: { code: "UNAUTHORIZED", message: "Expired.", requestId: "req-2", details: {} },
            });
          }
          return jsonResponse(200, { id: "cart-1", items: [] });
        }
        throw new Error(`unexpected path ${path}`);
      }),
    );

    const result = await request("/cart");

    expect(result).toEqual({ id: "cart-1", items: [] });
    expect(accessToken).toBe("new-token");
    expect(cartCalls).toBe(2);
  });

  it("de-duplicates concurrent 401 refreshes into a single /auth/refresh call", async () => {
    let refreshCalls = 0;
    let cartAttempt = 0;
    let wishlistAttempt = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const path = pathOf(input);
        if (path.endsWith("/auth/refresh")) {
          refreshCalls++;
          return jsonResponse(200, { accessToken: "new-token", refreshToken: "r2" });
        }
        if (path.endsWith("/cart")) {
          cartAttempt++;
          if (cartAttempt === 1) {
            return jsonResponse(401, {
              error: { code: "UNAUTHORIZED", message: "Expired.", requestId: "req-3", details: {} },
            });
          }
          return jsonResponse(200, { id: "cart-1" });
        }
        if (path.endsWith("/wishlist")) {
          wishlistAttempt++;
          if (wishlistAttempt === 1) {
            return jsonResponse(401, {
              error: { code: "UNAUTHORIZED", message: "Expired.", requestId: "req-4", details: {} },
            });
          }
          return jsonResponse(200, { items: [] });
        }
        throw new Error(`unexpected path ${path}`);
      }),
    );

    const [cart, wishlist] = await Promise.all([request("/cart"), request("/wishlist")]);

    expect(cart).toEqual({ id: "cart-1" });
    expect(wishlist).toEqual({ items: [] });
    expect(refreshCalls).toBe(1);
  });

  it("calls onAuthExpired and rethrows when refresh itself fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const path = pathOf(input);
        if (path.endsWith("/auth/refresh")) {
          return jsonResponse(401, {
            error: { code: "INVALID_REFRESH_TOKEN", message: "Session expired.", requestId: "req-5", details: {} },
          });
        }
        return jsonResponse(401, {
          error: { code: "UNAUTHORIZED", message: "Expired.", requestId: "req-6", details: {} },
        });
      }),
    );

    await expect(request("/cart")).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect(onAuthExpiredCalls).toBe(1);
  });
});
