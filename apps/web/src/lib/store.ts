"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { BehaviorEvent, CartItem, EventType, Order } from "./types";
import { getProduct } from "./data";

type User = { name: string; email: string } | null;

type StoreState = {
  cart: CartItem[];
  wishlist: string[];
  recentlyViewed: string[];
  events: BehaviorEvent[];
  orders: Order[];
  user: User;
  personalizationEnabled: boolean;
  hydrated: boolean;

  addToCart: (productId: string, quantity?: number) => void;
  removeFromCart: (productId: string) => void;
  updateCartQuantity: (productId: string, quantity: number) => void;
  clearCart: () => void;

  toggleWishlist: (productId: string) => void;

  trackEvent: (eventType: EventType, data?: Partial<BehaviorEvent>) => void;
  recordView: (productId: string) => void;

  placeOrder: (address: string) => Order;

  login: (name: string, email: string) => void;
  logout: () => void;

  setPersonalization: (enabled: boolean) => void;
  clearActivity: () => void;
  setHydrated: () => void;
};

export const useStore = create<StoreState>()(
  persist(
    (set, get) => ({
      cart: [],
      wishlist: [],
      recentlyViewed: [],
      events: [],
      orders: [],
      user: null,
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

      placeOrder: (address) => {
        const state = get();
        const items = state.cart.map((c) => {
          const product = getProduct(c.productId);
          return { productId: c.productId, quantity: c.quantity, priceAtPurchase: product?.price || 0 };
        });
        const total = items.reduce((sum, i) => sum + i.priceAtPurchase * i.quantity, 0);
        const order: Order = {
          id: `ORD-${Date.now().toString(36).toUpperCase()}`,
          items,
          total,
          status: "confirmed",
          placedAt: new Date().toISOString(),
          address,
        };
        set((s) => ({ orders: [order, ...s.orders], cart: [] }));
        get().trackEvent("ORDER_COMPLETED", { metadata: { orderId: order.id } });
        return order;
      },

      login: (name, email) => set({ user: { name, email } }),
      logout: () => set({ user: null }),

      setPersonalization: (enabled) => set({ personalizationEnabled: enabled }),
      clearActivity: () => set({ events: [], recentlyViewed: [] }),
      setHydrated: () => set({ hydrated: true }),
    }),
    {
      name: "ai-commerce-store",
      onRehydrateStorage: () => (state) => {
        state?.setHydrated();
      },
    }
  )
);
