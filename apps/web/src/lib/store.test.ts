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
const authenticatedUser = {
  id: "u1",
  email: "ada@example.com",
  name: "Ada",
  isActive: true,
  createdAt: "2026-01-01T00:00:00.000Z",
  roles: ["CUSTOMER"] as Role[],
};

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
  it("persists signed-in personalization changes and rolls back on failure", async () => {
    useStore.setState({ user: { id: "u1", email: "a@b.com", name: "Ada", isActive: true, createdAt: "2026-01-01T00:00:00.000Z", roles: ["CUSTOMER"] } });
    const fetchSpy = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      expect(init?.method).toBe("PATCH");
      expect(JSON.parse(init?.body as string)).toEqual({ personalizationEnabled: false });
      return { ok: false, status: 500, json: async () => ({}) } as Response;
    });
    vi.stubGlobal("fetch", fetchSpy);

    await useStore.getState().setPersonalization(false);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(useStore.getState().personalizationEnabled).toBe(true);
  });

  it("does not let an older failed preference update roll back a newer choice", async () => {
    useStore.setState({ user: authenticatedUser });
    let rejectFirst!: (error: Error) => void;
    const firstRequest = new Promise<Response>((_, reject) => {
      rejectFirst = reject;
    });
    const fetchSpy = vi.fn(() =>
      fetchSpy.mock.calls.length === 1
        ? firstRequest
        : Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({}),
          } as Response),
    );
    vi.stubGlobal("fetch", fetchSpy);

    const firstUpdate = useStore.getState().setPersonalization(false);
    await vi.waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1));
    await useStore.getState().setPersonalization(true);
    rejectFirst(new Error("older request failed"));
    await firstUpdate;

    expect(useStore.getState().personalizationEnabled).toBe(true);
  });

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
        "GET /api/v1/users/me/profile": {
          body: { id: "p1", userId: "u1", personalizationEnabled: true, notificationPreferences: {} },
        },
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

  it("clears a partial session when login hydration fails", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch({
        "POST /api/v1/auth/login": { body: { accessToken: "tok-1", refreshToken: "r1", user: { id: "u1", email: "ada@example.com", name: "Ada", roles: ["CUSTOMER"] } } },
        "GET /api/v1/users/me": { status: 503, body: {} },
      }),
    );

    await expect(useStore.getState().login("ada@example.com", "password123")).rejects.toThrow();
    expect(useStore.getState().user).toBeNull();
    expect(useStore.getState().accessToken).toBeNull();
    expect(useStore.getState().authStatus).toBe("unauthenticated");
  });

  it("does not establish a session when login finishes after session clearing", async () => {
    let resolveLogin!: (response: Response) => void;
    const loginResponse = new Promise<Response>((resolve) => {
      resolveLogin = resolve;
    });
    const fetchSpy = vi.fn(async (input: RequestInfo | URL) => {
      if (new URL(typeof input === "string" ? input : input.toString()).pathname.endsWith("/auth/login")) {
        return loginResponse;
      }
      throw new Error("stale login should not hydrate");
    });
    vi.stubGlobal("fetch", fetchSpy);

    const pending = useStore.getState().login("ada@example.com", "password123");
    await vi.waitFor(() => expect(fetchSpy).toHaveBeenCalled());
    useStore.getState().clearSession();
    resolveLogin({
      ok: true,
      status: 200,
      json: async () => ({ accessToken: "old-token", refreshToken: "r1", user: { id: "u1", email: "ada@example.com", name: "Ada", roles: ["CUSTOMER"] } }),
    } as Response);
    await pending;

    expect(useStore.getState().user).toBeNull();
    expect(useStore.getState().accessToken).toBeNull();
  });

  it("logout clears the session", async () => {
    vi.stubGlobal("fetch", mockFetch({ "POST /api/v1/auth/logout": { status: 204 } }));
    useStore.setState({ user: authenticatedUser, accessToken: "tok-1", authStatus: "authenticated" });

    await useStore.getState().logout();

    expect(useStore.getState().user).toBeNull();
    expect(useStore.getState().accessToken).toBeNull();
    expect(useStore.getState().authStatus).toBe("unauthenticated");
  });

  it("drops a server cart response that arrives after the session is cleared", async () => {
    let resolveCart!: (response: Response) => void;
    const cartResponse = new Promise<Response>((resolve) => {
      resolveCart = resolve;
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        if (new URL(typeof input === "string" ? input : input.toString()).pathname.endsWith("/cart")) {
          return cartResponse;
        }
        return { ok: true, status: 204, json: async () => undefined } as Response;
      }),
    );
    useStore.setState({ user: authenticatedUser, accessToken: "tok-1", authStatus: "authenticated" });

    const pending = useStore.getState().fetchServerCart();
    await vi.waitFor(() => expect(useStore.getState().serverCartStatus).toBe("loading"));
    useStore.getState().clearSession();
    resolveCart({ ok: true, status: 200, json: async () => ({ id: "old-cart" }) } as Response);
    await pending;

    expect(useStore.getState().serverCart).toBeNull();
    expect(useStore.getState().serverCartStatus).toBe("idle");
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

  it("keeps the newest overlapping wishlist fetch response", async () => {
    useStore.setState({ user: authenticatedUser, accessToken: "tok-1" });
    let resolveFirst!: (response: Response) => void;
    let resolveSecond!: (response: Response) => void;
    let requestCount = 0;
    const firstResponse = new Promise<Response>((resolve) => {
      resolveFirst = resolve;
    });
    const secondResponse = new Promise<Response>((resolve) => {
      resolveSecond = resolve;
    });
    const fetchSpy = vi.fn(() => {
      requestCount++;
      return requestCount === 1 ? firstResponse : secondResponse;
    });
    vi.stubGlobal("fetch", fetchSpy);

    const firstFetch = useStore.getState().fetchServerWishlist();
    await vi.waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1));
    const secondFetch = useStore.getState().fetchServerWishlist();
    await vi.waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(2));

    resolveSecond({
      ok: true,
      status: 200,
      json: async () => ({ items: [{ productId: "new" }] }),
    } as Response);
    await secondFetch;
    resolveFirst({
      ok: true,
      status: 200,
      json: async () => ({ items: [{ productId: "old" }] }),
    } as Response);
    await firstFetch;

    expect(useStore.getState().serverWishlist).toEqual({
      items: [{ productId: "new" }],
    });
  });

  it("drops a cart mutation response that arrives after the session is cleared", async () => {
    let resolveCart!: (response: Response) => void;
    const cartResponse = new Promise<Response>((resolve) => {
      resolveCart = resolve;
    });
    const fetchSpy = vi.fn(async () => cartResponse);
    vi.stubGlobal("fetch", fetchSpy);
    useStore.setState({ user: authenticatedUser, accessToken: "tok-1", authStatus: "authenticated" });

    const pending = useStore.getState().addServerCartItem("v1", 1);
    await vi.waitFor(() => expect(fetchSpy).toHaveBeenCalled());
    useStore.getState().clearSession();
    resolveCart({ ok: true, status: 200, json: async () => ({ id: "old-cart", items: [] }) } as Response);
    await pending;

    expect(useStore.getState().serverCart).toBeNull();
  });

  it("keeps the newest overlapping cart fetch response", async () => {
    useStore.setState({ user: authenticatedUser, accessToken: "tok-1" });
    let resolveFirst!: (response: Response) => void;
    let resolveSecond!: (response: Response) => void;
    let requestCount = 0;
    const firstResponse = new Promise<Response>((resolve) => {
      resolveFirst = resolve;
    });
    const secondResponse = new Promise<Response>((resolve) => {
      resolveSecond = resolve;
    });
    const fetchSpy = vi.fn(() => {
      requestCount++;
      return requestCount === 1 ? firstResponse : secondResponse;
    });
    vi.stubGlobal("fetch", fetchSpy);

    const firstFetch = useStore.getState().fetchServerCart();
    await vi.waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1));
    const secondFetch = useStore.getState().fetchServerCart();
    await vi.waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(2));

    resolveSecond({
      ok: true,
      status: 200,
      json: async () => ({ id: "new-cart", items: [] }),
    } as Response);
    await secondFetch;
    resolveFirst({
      ok: true,
      status: 200,
      json: async () => ({ id: "old-cart", items: [] }),
    } as Response);
    await firstFetch;

    expect(useStore.getState().serverCart).toEqual({
      id: "new-cart",
      items: [],
    });
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

  it("finalizeServerOrder confirms the payment, then re-fetches the order and cart", async () => {
    const confirmedOrder = { id: "ord-1", status: "CONFIRMED", total: 500 };
    const emptyCart = { id: "cart-1", items: [], itemCount: 0, subtotal: 0, currency: "INR", hasUnavailableItems: false };
    useStore.setState({ user: authenticatedUser, accessToken: "tok-1", authStatus: "authenticated" });

    vi.stubGlobal(
      "fetch",
      mockFetch({
        "POST /api/v1/payments/pay-1/confirm": {
          status: 201,
          body: { paymentId: "pay-1", orderId: "ord-1", status: "SUCCEEDED", amount: 500, currency: "INR", failureReason: null },
        },
        "GET /api/v1/orders/ord-1": { body: confirmedOrder },
        "GET /api/v1/cart": { body: emptyCart },
      }),
    );

    const result = await useStore.getState().finalizeServerOrder("ord-1", "pay-1");

    expect(result).toEqual(confirmedOrder);
    // fetchServerCart() is fired but not awaited by finalizeServerOrder — wait for it to settle.
    await vi.waitFor(() => expect(useStore.getState().serverCart).toEqual(emptyCart));
  });

  it("finalizeServerOrder throws the real failure reason and does not fetch the order when confirmation fails", async () => {
    const fetchSpy = mockFetch({
      "POST /api/v1/payments/pay-1/confirm": {
        status: 201,
        body: { paymentId: "pay-1", orderId: "ord-1", status: "FAILED", amount: 500, currency: "INR", failureReason: "Razorpay payment signature verification failed." },
      },
    });
    vi.stubGlobal("fetch", fetchSpy);

    await expect(useStore.getState().finalizeServerOrder("ord-1", "pay-1")).rejects.toThrow(
      "Razorpay payment signature verification failed.",
    );
    // Only the confirm call happened — no follow-up GET /orders/:id once confirmation failed.
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});

describe("ShopAI actions", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function stubShopAIFetch(handler: (body: Record<string, unknown>, callIndex: number) => { status: number; body: unknown }) {
    let callIndex = 0;
    return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      callIndex += 1;
      const url = typeof input === "string" ? input : input.toString();
      expect(new URL(url).pathname).toBe("/api/v1/shopai/message");
      const body = init?.body ? JSON.parse(init.body as string) : {};
      const { status, body: responseBody } = handler(body, callIndex);
      return { ok: status >= 200 && status < 300, status, json: async () => responseBody } as Response;
    });
  }

  it("a guest's first message generates and persists an anonymous id; the next message reuses it and the conversation id", async () => {
    const requestBodies: Record<string, unknown>[] = [];
    vi.stubGlobal(
      "fetch",
      stubShopAIFetch((body, callIndex) => {
        requestBodies.push(body);
        return {
          status: 200,
          body: { conversationId: "conv-1", message: { role: "assistant", content: `reply ${callIndex}` }, toolActivity: [] },
        };
      }),
    );

    const first = await useStore.getState().sendShopAIMessage("hello");
    expect(first).toEqual({ role: "assistant", content: "reply 1" });
    expect(requestBodies[0].conversationId).toBeUndefined();
    const anonymousId = requestBodies[0].anonymousId;
    expect(typeof anonymousId).toBe("string");
    expect(useStore.getState().anonymousId).toBe(anonymousId);
    expect(useStore.getState().shopaiConversationId).toBe("conv-1");

    await useStore.getState().sendShopAIMessage("again");
    expect(requestBodies[1]).toEqual({ message: "again", conversationId: "conv-1", anonymousId });
  });

  it("recovers from a stale conversation id by retrying as a fresh conversation", async () => {
    useStore.setState({ shopaiConversationId: "stale-conv", anonymousId: "anon-1" });
    vi.stubGlobal(
      "fetch",
      stubShopAIFetch((body, callIndex) => {
        if (callIndex === 1) {
          expect(body.conversationId).toBe("stale-conv");
          return {
            status: 404,
            body: { error: { code: "CONVERSATION_NOT_FOUND", message: "Conversation not found.", requestId: "r1", details: {} } },
          };
        }
        expect(body.conversationId).toBeUndefined();
        return {
          status: 200,
          body: { conversationId: "conv-2", message: { role: "assistant", content: "fresh reply" }, toolActivity: [] },
        };
      }),
    );

    const reply = await useStore.getState().sendShopAIMessage("hi again");
    expect(reply).toEqual({ role: "assistant", content: "fresh reply" });
    expect(useStore.getState().shopaiConversationId).toBe("conv-2");
  });

  it("a logged-in user's messages never carry an anonymous id", async () => {
    useStore.setState({ user: { id: "u1", email: "a@b.com", name: "Ada", isActive: true, createdAt: "2026-01-01T00:00:00.000Z", roles: ["CUSTOMER"] } });
    const requestBodies: Record<string, unknown>[] = [];
    vi.stubGlobal(
      "fetch",
      stubShopAIFetch((body) => {
        requestBodies.push(body);
        return { status: 200, body: { conversationId: "conv-3", message: { role: "assistant", content: "hi" }, toolActivity: [] } };
      }),
    );

    await useStore.getState().sendShopAIMessage("hello");
    expect(requestBodies[0].anonymousId).toBeUndefined();
    expect(useStore.getState().anonymousId).toBeNull();
  });

  it("does not restore a conversation after the session is cleared", async () => {
    let resolveResponse!: (response: Response) => void;
    const response = new Promise<Response>((resolve) => {
      resolveResponse = resolve;
    });
    const fetchSpy = vi.fn(async () => response);
    vi.stubGlobal("fetch", fetchSpy);
    useStore.setState({ user: authenticatedUser, accessToken: "tok-1", authStatus: "authenticated" });

    const pending = useStore.getState().sendShopAIMessage("hello");
    await vi.waitFor(() => expect(fetchSpy).toHaveBeenCalled());
    useStore.getState().clearSession();
    resolveResponse({
      ok: true,
      status: 200,
      json: async () => ({ conversationId: "old-conversation", message: { role: "assistant", content: "hello" }, toolActivity: [] }),
    } as Response);
    await pending;

    expect(useStore.getState().shopaiConversationId).toBeNull();
  });
});

describe("real event tracking and behavioral profile", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("trackRealEvent posts a single well-formed event and generates an anonymous id on first use", async () => {
    const tracked = vi.fn();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === "string" ? input : input.toString();
        expect(new URL(url).pathname).toBe("/api/v1/events");
        const body = JSON.parse(init!.body as string);
        tracked(body);
        return { ok: true, status: 202, json: async () => ({ accepted: body.events.length }) } as Response;
      }),
    );

    useStore.getState().trackRealEvent("PRODUCT_ADDED_TO_CART", "p1", { variantId: "v1" });
    await vi.waitFor(() => expect(tracked).toHaveBeenCalledTimes(1));

    const [{ events }] = tracked.mock.calls[0];
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ eventType: "PRODUCT_ADDED_TO_CART", entityId: "p1", metadata: { variantId: "v1" } });
    expect(typeof events[0].eventId).toBe("string");
    expect(typeof events[0].anonymousId).toBe("string");
    expect(typeof events[0].sessionId).toBe("string");
    expect(events[0].source).toBe("WEB");
    expect(useStore.getState().anonymousId).toBe(events[0].anonymousId);
  });

  it("does not fire a real event when personalization is disabled", async () => {
    useStore.setState({ personalizationEnabled: false });
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    useStore.getState().trackRealEvent("PRODUCT_VIEWED", "p1");

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("a PRODUCT_VIEWED event also updates the real recently-viewed list, most-recent-first and deduplicated", () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, status: 202, json: async () => ({ accepted: 1 }) }) as Response));

    useStore.getState().trackRealEvent("PRODUCT_VIEWED", "p1");
    useStore.getState().trackRealEvent("PRODUCT_VIEWED", "p2");
    useStore.getState().trackRealEvent("PRODUCT_VIEWED", "p1");

    expect(useStore.getState().recentlyViewedReal).toEqual(["p1", "p2"]);
  });

  it("fetchBehavioralProfile loads the real profile for a signed-in user and stays null for a guest", async () => {
    const profile = {
      categoryAffinity: { viewed: { "cat-1": 3 }, addedToCart: {}, purchased: {} },
      brandAffinity: { viewed: {} },
      priceRange: { min: 100, max: 500 },
      eventCount: 3,
      orderCount: 0,
      segment: "browser" as const,
      lifecycleStage: "prospect" as const,
      firstSeenAt: "2026-01-01T00:00:00.000Z",
      lastEventAt: "2026-01-02T00:00:00.000Z",
    };
    vi.stubGlobal("fetch", mockFetch({ "GET /api/v1/users/me/behavioral-profile": { body: { profile } } }));

    await useStore.getState().fetchBehavioralProfile();
    expect(useStore.getState().behavioralProfile).toBeNull(); // no user signed in

    useStore.setState({ user: { id: "u1", email: "a@b.com", name: "Ada", isActive: true, createdAt: "2026-01-01T00:00:00.000Z", roles: ["CUSTOMER"] } });
    await useStore.getState().fetchBehavioralProfile();
    expect(useStore.getState().behavioralProfile).toEqual(profile);
  });

  it("clearActivity always clears local state, and also calls the real delete endpoint when signed in", async () => {
    useStore.setState({ events: [{ eventType: "PRODUCT_VIEWED", timestamp: 1 }], recentlyViewed: ["p1"], recentlyViewedReal: ["p1"] });
    const deleteMock: typeof fetch = async () => ({ ok: true, status: 204, json: async () => undefined }) as Response;
    const deleteSpy = vi.fn(deleteMock);
    vi.stubGlobal("fetch", deleteSpy);

    await useStore.getState().clearActivity();
    expect(useStore.getState().events).toEqual([]);
    expect(useStore.getState().recentlyViewed).toEqual([]);
    expect(useStore.getState().recentlyViewedReal).toEqual([]);
    expect(deleteSpy).not.toHaveBeenCalled(); // guest — nothing real to delete

    useStore.setState({ user: { id: "u1", email: "a@b.com", name: "Ada", isActive: true, createdAt: "2026-01-01T00:00:00.000Z", roles: ["CUSTOMER"] } });
    await useStore.getState().clearActivity();
    expect(deleteSpy).toHaveBeenCalledTimes(1);
    const [url, init] = deleteSpy.mock.calls[0];
    expect(new URL(url as string).pathname).toBe("/api/v1/users/me/activity");
    expect(init?.method).toBe("DELETE");
  });

  it("keeps local activity when signed-in server deletion fails", async () => {
    useStore.setState({
      user: { id: "u1", email: "a@b.com", name: "Ada", isActive: true, createdAt: "2026-01-01T00:00:00.000Z", roles: ["CUSTOMER"] },
      events: [{ eventType: "PRODUCT_VIEWED", timestamp: 1 }],
      recentlyViewed: ["p1"],
      recentlyViewedReal: ["p1"],
    });
    vi.stubGlobal(
      "fetch",
      mockFetch({ "DELETE /api/v1/users/me/activity": { status: 500, body: {} } }),
    );

    await expect(useStore.getState().clearActivity()).rejects.toThrow();
    expect(useStore.getState().events).toHaveLength(1);
    expect(useStore.getState().recentlyViewed).toEqual(["p1"]);
    expect(useStore.getState().recentlyViewedReal).toEqual(["p1"]);
  });
});
