"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { CartResponse, PublicUser, WishlistResponse } from "@ai-commerce/types";
import { authApi, cartApi, configureApiClient, wishlistApi } from "@ai-commerce/api-client";
import type { BehaviorEvent, CartItem, EventType, Order, OrderItem } from "./types";
import { getProduct } from "./data";

export type AuthStatus = "idle" | "checking" | "authenticated" | "unauthenticated";
type AsyncStatus = "idle" | "loading" | "error";

type StoreState = {
  // ---- Legacy, fake-catalog-backed state (untouched — still powers
  // recommend.ts/shopai.ts/admin.ts and the fabricated checkout/order flow) ----
  cart: CartItem[];
  wishlist: string[];
  recentlyViewed: string[];
  events: BehaviorEvent[];
  orders: Order[];
  personalizationEnabled: boolean;
  hydrated: boolean;

  addToCart: (productId: string, quantity?: number) => void;
  removeFromCart: (productId: string) => void;
  updateCartQuantity: (productId: string, quantity: number) => void;
  clearCart: () => void;

  toggleWishlist: (productId: string) => void;

  trackEvent: (eventType: EventType, data?: Partial<BehaviorEvent>) => void;
  recordView: (productId: string) => void;

  /** `items` lets checkout pass real-cart line items directly (with their own name/image
   *  snapshot) instead of relying on the legacy `cart` array — defaults to deriving from
   *  `cart`/getProduct() when omitted, preserving the original fake-catalog-only behavior. */
  placeOrder: (address: string, items?: OrderItem[]) => Order;

  setPersonalization: (enabled: boolean) => void;
  clearActivity: () => void;
  setHydrated: () => void;

  // ---- Real session/catalog state (new) ----
  user: PublicUser | null;
  accessToken: string | null;
  authStatus: AuthStatus;

  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name: string) => Promise<void>;
  logout: () => Promise<void>;
  /** Sync — clears session state without a network call (used after a failed
   *  refresh, or internally by logout()). */
  clearSession: () => void;

  serverCart: CartResponse | null;
  serverCartStatus: AsyncStatus;
  fetchServerCart: () => Promise<void>;
  addServerCartItem: (variantId: string, quantity: number) => Promise<void>;
  updateServerCartItem: (itemId: string, quantity: number) => Promise<void>;
  removeServerCartItem: (itemId: string) => Promise<void>;
  clearServerCart: () => Promise<void>;

  serverWishlist: WishlistResponse | null;
  serverWishlistStatus: AsyncStatus;
  fetchServerWishlist: () => Promise<void>;
  toggleServerWishlistItem: (productId: string) => Promise<void>;
};

export const useStore = create<StoreState>()(
  persist(
    (set, get) => ({
      cart: [],
      wishlist: [],
      recentlyViewed: [],
      events: [],
      orders: [],
      personalizationEnabled: true,
      hydrated: false,

      addToCart: (productId, quantity = 1) => {
        set((state) => {
          const existing = state.cart.find((c) => c.productId === productId);
          const cart = existing
            ? state.cart.map((c) => (c.productId === productId ? { ...c, quantity: c.quantity + quantity } : c))
            : [...state.cart, { productId, quantity }];
          return { cart };
        });
        get().trackEvent("PRODUCT_ADDED_TO_CART", { productId });
      },

      removeFromCart: (productId) => {
        set((state) => ({ cart: state.cart.filter((c) => c.productId !== productId) }));
        get().trackEvent("PRODUCT_REMOVED_FROM_CART", { productId });
      },

      updateCartQuantity: (productId, quantity) => {
        set((state) => ({
          cart: quantity <= 0
            ? state.cart.filter((c) => c.productId !== productId)
            : state.cart.map((c) => (c.productId === productId ? { ...c, quantity } : c)),
        }));
      },

      clearCart: () => set({ cart: [] }),

      toggleWishlist: (productId) => {
        const isWishlisted = get().wishlist.includes(productId);
        set((state) => ({
          wishlist: isWishlisted
            ? state.wishlist.filter((id) => id !== productId)
            : [...state.wishlist, productId],
        }));
        get().trackEvent(isWishlisted ? "PRODUCT_REMOVED_FROM_WISHLIST" : "PRODUCT_WISHLISTED", { productId });
      },

      trackEvent: (eventType, data = {}) => {
        if (!get().personalizationEnabled && eventType !== "AI_ASSISTANT_QUERY") return;
        const event: BehaviorEvent = { eventType, timestamp: Date.now(), ...data };
        set((state) => ({ events: [...state.events.slice(-499), event] }));
      },

      recordView: (productId) => {
        set((state) => ({
          recentlyViewed: [productId, ...state.recentlyViewed.filter((id) => id !== productId)].slice(0, 20),
        }));
        get().trackEvent("PRODUCT_VIEWED", { productId });
      },

      placeOrder: (address, items) => {
        const state = get();
        const orderItems =
          items ??
          state.cart.map((c) => {
            const product = getProduct(c.productId);
            return { productId: c.productId, quantity: c.quantity, priceAtPurchase: product?.price || 0 };
          });
        const total = orderItems.reduce((sum, i) => sum + i.priceAtPurchase * i.quantity, 0);
        const order: Order = {
          id: `ORD-${Date.now().toString(36).toUpperCase()}`,
          items: orderItems,
          total,
          status: "confirmed",
          placedAt: new Date().toISOString(),
          address,
        };
        set((s) => ({ orders: [order, ...s.orders], cart: [] }));
        get().trackEvent("ORDER_COMPLETED", { metadata: { orderId: order.id } });
        return order;
      },

      setPersonalization: (enabled) => set({ personalizationEnabled: enabled }),
      clearActivity: () => set({ events: [], recentlyViewed: [] }),
      setHydrated: () => set({ hydrated: true }),

      // ---- Real session/catalog state ----
      user: null,
      accessToken: null,
      authStatus: "idle",

      login: async (email, password) => {
        const result = await authApi.login({ email, password });
        set({ accessToken: result.accessToken, authStatus: "authenticated" });
        const me = await authApi.me();
        set({ user: me });
        void get().fetchServerCart();
        void get().fetchServerWishlist();
      },

      register: async (email, password, name) => {
        const result = await authApi.register({ email, password, name });
        set({ accessToken: result.accessToken, authStatus: "authenticated" });
        const me = await authApi.me();
        set({ user: me });
        void get().fetchServerCart();
        void get().fetchServerWishlist();
      },

      logout: async () => {
        await authApi.logout().catch(() => undefined);
        get().clearSession();
      },

      clearSession: () =>
        set({
          user: null,
          accessToken: null,
          authStatus: "unauthenticated",
          serverCart: null,
          serverWishlist: null,
        }),

      serverCart: null,
      serverCartStatus: "idle",

      fetchServerCart: async () => {
        set({ serverCartStatus: "loading" });
        try {
          const cart = await cartApi.getCart();
          set({ serverCart: cart, serverCartStatus: "idle" });
        } catch {
          set({ serverCartStatus: "error" });
        }
      },

      addServerCartItem: async (variantId, quantity) => {
        const cart = await cartApi.addItem(variantId, quantity);
        set({ serverCart: cart });
      },

      updateServerCartItem: async (itemId, quantity) => {
        const cart = await cartApi.updateItem(itemId, quantity);
        set({ serverCart: cart });
      },

      removeServerCartItem: async (itemId) => {
        const cart = await cartApi.removeItem(itemId);
        set({ serverCart: cart });
      },

      clearServerCart: async () => {
        await cartApi.clear();
        set({ serverCart: null });
      },

      serverWishlist: null,
      serverWishlistStatus: "idle",

      fetchServerWishlist: async () => {
        set({ serverWishlistStatus: "loading" });
        try {
          const wishlist = await wishlistApi.list();
          set({ serverWishlist: wishlist, serverWishlistStatus: "idle" });
        } catch {
          set({ serverWishlistStatus: "error" });
        }
      },

      toggleServerWishlistItem: async (productId) => {
        const isWishlisted =
          get().serverWishlist?.items.some((i) => i.productId === productId) ?? false;
        const wishlist = isWishlisted
          ? await wishlistApi.remove(productId)
          : await wishlistApi.add(productId);
        set({ serverWishlist: wishlist });
      },
    }),
    {
      name: "ai-commerce-store",
      // Excludes the token and any server-fetched state — the access token never touches
      // localStorage (limits XSS exposure), and serverCart/serverWishlist are always
      // re-fetched fresh after login/mount rather than trusted from a stale cache.
      partialize: (state) => ({
        cart: state.cart,
        wishlist: state.wishlist,
        recentlyViewed: state.recentlyViewed,
        events: state.events,
        orders: state.orders,
        user: state.user,
        personalizationEnabled: state.personalizationEnabled,
      }),
      onRehydrateStorage: () => (state) => {
        state?.setHydrated();
      },
    }
  )
);

configureApiClient({
  getAccessToken: () => useStore.getState().accessToken,
  setAccessToken: (token) => useStore.setState({ accessToken: token }),
  onAuthExpired: () => useStore.getState().clearSession(),
});
