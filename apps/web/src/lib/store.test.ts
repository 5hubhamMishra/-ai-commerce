import { beforeEach, describe, expect, it } from "vitest";
import { useStore } from "./store";
import { products } from "./data";

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
  it("login sets the user, logout clears it", () => {
    useStore.getState().login("Ada", "ada@example.com");
    expect(useStore.getState().user).toEqual({ name: "Ada", email: "ada@example.com" });
    useStore.getState().logout();
    expect(useStore.getState().user).toBeNull();
  });
});
