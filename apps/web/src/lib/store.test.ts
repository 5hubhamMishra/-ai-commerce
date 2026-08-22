import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Role } from "@ai-commerce/types";
import { useStore } from "./store";
import { products } from "./data";

/** Routes a stubbed `fetch` by `METHOD /path` against a response table — used to test the
 *  store's real-API-backed actions (auth, server cart/wishlist) without a live apps/api. */
function mockFetch(responses: Record<string, { status?: number; body?: unknown }>) {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    const method = (init?.method ?? "GET").toUpperCase();
    const key = `${method} ${new URL(url).pathname}`;
    const entry = responses[key] ?? { status: 204, body: undefined };
    const status = entry.status ?? 200;
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => entry.body,
    } as Response;
  });
}

const productA = products[0].id;
const productB = products[1].id;

const initialState = useStore.getState();

beforeEach(() => {
  useStore.setState(
    {
      ...initialState,
      cart: [],
      wishlist: [],
      recentlyViewed: [],
      events: [],
      orders: [],
      user: null,
      personalizationEnabled: true,
    },
    true,
  );
});

describe("cart actions", () => {
  it("adds a new product to an empty cart", () => {
    useStore.getState().addToCart(productA);
    expect(useStore.getState().cart).toEqual([{ productId: productA, quantity: 1 }]);
  });

  it("increments quantity when adding an already-present product", () => {
    useStore.getState().addToCart(productA, 2);
    useStore.getState().addToCart(productA, 3);
    expect(useStore.getState().cart).toEqual([{ productId: productA, quantity: 5 }]);
  });

  it("removes a product from the cart", () => {
    useStore.getState().addToCart(productA);
    useStore.getState().addToCart(productB);
    useStore.getState().removeFromCart(productA);
    expect(useStore.getState().cart).toEqual([{ productId: productB, quantity: 1 }]);
  });

  it("updateCartQuantity removes the line when quantity drops to zero", () => {
    useStore.getState().addToCart(productA);
    useStore.getState().updateCartQuantity(productA, 0);
    expect(useStore.getState().cart).toEqual([]);
  });

  it("clearCart empties the cart", () => {
    useStore.getState().addToCart(productA);
    useStore.getState().addToCart(productB);
    useStore.getState().clearCart();
    expect(useStore.getState().cart).toEqual([]);
  });
});

describe("wishlist actions", () => {
  it("toggles a product onto the wishlist", () => {
    useStore.getState().toggleWishlist(productA);
    expect(useStore.getState().wishlist).toContain(productA);
  });

  it("toggling twice removes it again", () => {
    useStore.getState().toggleWishlist(productA);
    useStore.getState().toggleWishlist(productA);
    expect(useStore.getState().wishlist).not.toContain(productA);
  });
});

describe("personalization / event tracking", () => {
  it("does not record behavior events when personalization is disabled", () => {
    useStore.getState().setPersonalization(false);
    useStore.getState().recordView(productA);
    expect(useStore.getState().events).toEqual([]);
  });

  it("still records AI_ASSISTANT_QUERY events even with personalization disabled", () => {
    useStore.getState().setPersonalization(false);
    useStore.getState().trackEvent("AI_ASSISTANT_QUERY", { query: "hello" });
    expect(useStore.getState().events).toHaveLength(1);
  });

  it("recordView tracks the product as most-recently-viewed, de-duplicated", () => {
    useStore.getState().recordView(productA);
    useStore.getState().recordView(productB);
    useStore.getState().recordView(productA);
    expect(useStore.getState().recentlyViewed[0]).toBe(productA);
    expect(useStore.getState().recentlyViewed).toHaveLength(2);
  });

  it("clearActivity wipes events and recently-viewed but not the cart", () => {
    useStore.getState().addToCart(productA);
    useStore.getState().recordView(productB);
    useStore.getState().clearActivity();
    expect(useStore.getState().events).toEqual([]);
    expect(useStore.getState().recentlyViewed).toEqual([]);
    expect(useStore.getState().cart).toHaveLength(1);
  });
});

describe("placeOrder", () => {
  it("creates an order from the cart, snapshotting price, and clears the cart", () => {
    useStore.getState().addToCart(productA, 2);
    const order = useStore.getState().placeOrder("123 Test St");

    expect(order.items).toEqual([
      { productId: productA, quantity: 2, priceAtPurchase: products[0].price },
    ]);
    expect(order.total).toBe(products[0].price * 2);
    expect(order.status).toBe("confirmed");
    expect(useStore.getState().cart).toEqual([]);
    expect(useStore.getState().orders[0].id).toBe(order.id);
  });
});

describe("auth", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const publicUser = {
    id: "u1",
    email: "ada@example.com",
    name: "Ada",
    isActive: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    roles: ["CUSTOMER"] as Role[],
  };
  const emptyCart = { id: "cart-1", items: [], itemCount: 0, subtotal: 0, currency: "INR", hasUnavailableItems: false };
  const emptyWishlist = { items: [] };

  it("login sets the user/token, and fetches the server cart and wishlist", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch({
        "POST /api/v1/auth/login": {
          body: { accessToken: "tok-1", refreshToken: "r1", user: { id: "u1", email: "ada@example.com", name: "Ada", roles: ["CUSTOMER"] } },
        },
        "GET /api/v1/users/me": { body: publicUser },
        "GET /api/v1/cart": { body: emptyCart },
        "GET /api/v1/wishlist": { body: emptyWishlist },
      }),
    );

    await useStore.getState().login("ada@example.com", "password123");

    expect(useStore.getState().user).toEqual(publicUser);
    expect(useStore.getState().accessToken).toBe("tok-1");
    expect(useStore.getState().authStatus).toBe("authenticated");
  });

  it("a failed login throws the API's error message and leaves the session unauthenticated", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch({
        "POST /api/v1/auth/login": {
          status: 401,
          body: { error: { code: "INVALID_CREDENTIALS", message: "Incorrect email or password.", requestId: "req-1", details: {} } },
        },
      }),
    );

    await expect(useStore.getState().login("ada@example.com", "wrong")).rejects.toThrow(
      "Incorrect email or password.",
    );
    expect(useStore.getState().user).toBeNull();
    expect(useStore.getState().authStatus).not.toBe("authenticated");
  });

  it("logout clears the session", async () => {
    vi.stubGlobal("fetch", mockFetch({ "POST /api/v1/auth/logout": { status: 204 } }));
    useStore.setState({ user: publicUser, accessToken: "tok-1", authStatus: "authenticated" });

    await useStore.getState().logout();

    expect(useStore.getState().user).toBeNull();
    expect(useStore.getState().accessToken).toBeNull();
    expect(useStore.getState().authStatus).toBe("unauthenticated");
  });
});

describe("server cart / wishlist actions", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("addServerCartItem stores the cart the API returns", async () => {
    const cart = {
      id: "cart-1",
      items: [
        {
          id: "item-1",
          variantId: "v1",
          productId: "p1",
          productName: "Widget",
          productSlug: "widget",
          sku: "SKU1",
          imageUrl: null,
          unitPrice: 100,
          currency: "INR",
          quantity: 1,
          lineTotal: 100,
          availableQuantity: 5,
          isAvailable: true,
          insufficientStock: false,
          attributes: [],
        },
      ],
      itemCount: 1,
      subtotal: 100,
      currency: "INR",
      hasUnavailableItems: false,
    };
    vi.stubGlobal("fetch", mockFetch({ "POST /api/v1/cart/items": { body: cart } }));

    await useStore.getState().addServerCartItem("v1", 1);

    expect(useStore.getState().serverCart).toEqual(cart);
  });

  it("toggleServerWishlistItem adds when absent, removes when present", async () => {
    const withItem = {
      items: [
        {
          productId: "p1",
          slug: "widget",
          name: "Widget",
          brand: null,
          status: "ACTIVE",
          imageUrl: null,
          minPrice: 100,
          maxPrice: 100,
          isAvailable: true,
          addedAt: "2026-01-01T00:00:00.000Z",
        },
      ],
    };

    vi.stubGlobal("fetch", mockFetch({ "POST /api/v1/wishlist/items": { body: withItem } }));
    await useStore.getState().toggleServerWishlistItem("p1");
    expect(useStore.getState().serverWishlist).toEqual(withItem);

    vi.stubGlobal("fetch", mockFetch({ "DELETE /api/v1/wishlist/items/p1": { body: { items: [] } } }));
    await useStore.getState().toggleServerWishlistItem("p1");
    expect(useStore.getState().serverWishlist).toEqual({ items: [] });
  });
});
