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

describe("server address / order actions", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const address = {
    id: "addr-1",
    userId: "u1",
    label: "Home",
    line1: "221B Baker Street",
    line2: null,
    city: "Mumbai",
    state: "Maharashtra",
    postalCode: "400001",
    country: "India",
    isDefault: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };

  it("createServerAddress stores the address the API returns and marks it as the sole default", async () => {
    vi.stubGlobal("fetch", mockFetch({ "POST /api/v1/addresses": { status: 201, body: address } }));

    const created = await useStore.getState().createServerAddress({
      line1: address.line1,
      city: address.city,
      state: address.state,
      postalCode: address.postalCode,
      country: address.country,
      isDefault: true,
    });

    expect(created).toEqual(address);
    expect(useStore.getState().serverAddresses).toEqual([address]);
  });

  it("a newly created default address demotes any previously-default address in local state", async () => {
    const oldDefault = { ...address, id: "addr-old" };
    useStore.setState({ serverAddresses: [oldDefault] });
    const newDefault = { ...address, id: "addr-new" };
    vi.stubGlobal("fetch", mockFetch({ "POST /api/v1/addresses": { status: 201, body: newDefault } }));

    await useStore.getState().createServerAddress({
      line1: newDefault.line1,
      city: newDefault.city,
      state: newDefault.state,
      postalCode: newDefault.postalCode,
      country: newDefault.country,
      isDefault: true,
    });

    expect(useStore.getState().serverAddresses).toEqual([
      newDefault,
      { ...oldDefault, isDefault: false },
    ]);
  });

  it("removeServerAddress drops it from local state", async () => {
    useStore.setState({ serverAddresses: [address] });
    vi.stubGlobal("fetch", mockFetch({ "DELETE /api/v1/addresses/addr-1": { status: 204 } }));

    await useStore.getState().removeServerAddress("addr-1");

    expect(useStore.getState().serverAddresses).toEqual([]);
  });

  it("placeServerOrder orchestrates create-order -> create-payment -> confirm-payment, then re-fetches the cart and returns the confirmed order", async () => {
    const pendingOrder = { id: "ord-1", status: "PENDING_PAYMENT", total: 500 };
    const confirmedOrder = { id: "ord-1", status: "CONFIRMED", total: 500 };
    const emptyCart = { id: "cart-1", items: [], itemCount: 0, subtotal: 0, currency: "INR", hasUnavailableItems: false };

    vi.stubGlobal(
      "fetch",
      mockFetch({
        "POST /api/v1/orders": { status: 201, body: pendingOrder },
        "POST /api/v1/payments": {
          status: 201,
          body: { paymentId: "pay-1", orderId: "ord-1", providerRef: "dev_1", clientSecret: null, amount: 500, currency: "INR", status: "PENDING" },
        },
        "POST /api/v1/payments/pay-1/confirm": {
          status: 201,
          body: { paymentId: "pay-1", orderId: "ord-1", status: "SUCCEEDED", amount: 500, currency: "INR", failureReason: null },
        },
        "GET /api/v1/orders/ord-1": { body: confirmedOrder },
        "GET /api/v1/cart": { body: emptyCart },
      }),
    );

    const result = await useStore.getState().placeServerOrder("addr-1", "STANDARD");

    expect(result).toEqual(confirmedOrder);
    // fetchServerCart() is fired but not awaited by placeServerOrder — wait for it to settle.
    await vi.waitFor(() => expect(useStore.getState().serverCart).toEqual(emptyCart));
  });
});
