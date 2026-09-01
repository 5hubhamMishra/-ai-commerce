"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type {
  Address,
  BehavioralEventType,
  BehavioralProfileView,
  CartResponse,
  CreateAddressInput,
  ExportDataResponse,
  OrderDetail,
  PublicUser,
  ShopAIMessage,
  UpdateAddressInput,
  WishlistResponse,
} from "@ai-commerce/types";
import {
  activityApi,
  addressesApi,
  ApiError,
  authApi,
  cartApi,
  configureApiClient,
  eventsApi,
  ordersApi,
  paymentsApi,
  shopaiApi,
  usersApi,
  wishlistApi,
} from "@ai-commerce/api-client";
import type { BehaviorEvent, CartItem, EventType, Order, OrderItem } from "./types";
import { getProduct } from "./data";

export type AuthStatus = "idle" | "checking" | "authenticated" | "unauthenticated";
type AsyncStatus = "idle" | "loading" | "error";

/** One id per browser tab-session (module-scope, not persisted — a reload starts a new
 *  session, matching typical analytics session semantics), generated lazily on first real
 *  event so a page that never tracks anything never pays for it. */
let sessionId: string | null = null;
let authOperation = 0;
let personalizationOperation = 0;
let cartFetchOperation = 0;
let wishlistFetchOperation = 0;
let addressFetchOperation = 0;
let behavioralProfileFetchOperation = 0;

type StoreState = {
  // ---- Legacy, fake-catalog-backed state (untouched — the fabricated checkout/order
  // flow it powers has no live UI path anymore, but store.test.ts still exercises it) ----
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

  setPersonalization: (enabled: boolean) => Promise<void>;
  /** Clears local activity always; additionally calls the real `DELETE /users/me/activity`
   *  when signed in, since that's the actual privacy-relevant data once events are real. */
  clearActivity: () => Promise<void>;
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

  /** Real GET /users/me/export (spec PRIVACY: "data export") — returns the response for the
   *  caller to turn into a download; not stored in state, it's a one-off action, not session
   *  data to keep around. */
  exportMyData: () => Promise<ExportDataResponse>;
  /** Real DELETE /users/me (spec PRIVACY: "account deletion") — requires the caller's current
   *  password. Clears local session state on success; the account itself is anonymized and
   *  retained server-side, not hard-deleted (see DECISIONS.md ADR-041). */
  deleteAccount: (password: string) => Promise<void>;

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

  serverAddresses: Address[] | null;
  serverAddressesStatus: AsyncStatus;
  fetchServerAddresses: () => Promise<void>;
  createServerAddress: (input: CreateAddressInput) => Promise<Address>;
  updateServerAddress: (id: string, input: UpdateAddressInput) => Promise<Address>;
  removeServerAddress: (id: string) => Promise<void>;

  /** Confirms an already-created payment (the checkout page owns order/payment *creation*
   *  itself now, since a real Razorpay payment needs a browser widget interaction in between
   *  create and confirm — a Zustand action can't open one), then re-fetches the cart (the
   *  backend already cleared it server-side as part of order creation) and returns the final
   *  order detail. Throws if the confirm outcome isn't SUCCEEDED — a real provider can
   *  legitimately return a failed confirmation as an ordinary 200 (tampered/expired
   *  signature), unlike the dev adapter, which always succeeds. */
  finalizeServerOrder: (
    orderId: string,
    paymentId: string,
    confirmPayload?: { razorpayPaymentId?: string; razorpaySignature?: string },
  ) => Promise<OrderDetail>;

  /** A random id persisted per-browser, generated lazily on first use — apps/api's sole
   *  ownership key for a logged-out caller's ShopAI conversation and behavioral events
   *  (ignored for ShopAI once a real JWT is present; events always carry it regardless of
   *  auth status, since it also drives session upsert/identity-linking server-side). */
  anonymousId: string | null;
  /** Returns the persisted anonymous id, generating and persisting one first if absent. */
  ensureAnonymousId: () => string;
  shopaiConversationId: string | null;
  /** Sends a message to the real, Anthropic-backed ShopAI and returns its reply. Recovers
   *  once from a stale/invalid `shopaiConversationId` (e.g. a guest's conversation orphaned
   *  by signing in mid-chat, since ownership then resolves by user id, not anonymousId) by
   *  retrying as a fresh conversation instead of surfacing a confusing 404 to the user. */
  sendShopAIMessage: (text: string) => Promise<ShopAIMessage>;

  /** Fires a real event at apps/api's behavioral pipeline — separate from the legacy local
   *  `trackEvent`, and only ever called from surfaces already operating on real backend ids
   *  (real cart/wishlist/orders/catalog), never the legacy fake-catalog surfaces, so a fake
   *  id never pollutes real affinity/recommendation data. Fire-and-forget: a failed request
   *  never surfaces to the caller, matching how apps/api treats its own impression logging. */
  trackRealEvent: (eventType: BehavioralEventType, entityId?: string, metadata?: Record<string, unknown>) => void;

  behavioralProfile: BehavioralProfileView | null;
  behavioralProfileStatus: AsyncStatus;
  fetchBehavioralProfile: () => Promise<void>;

  /** Real-catalog product ids, most-recent-first — the real-data equivalent of the legacy
   *  `recentlyViewed`, maintained by `trackRealEvent` itself on every `PRODUCT_VIEWED` so
   *  every real-PDP caller gets this for free without a separate call. */
  recentlyViewedReal: string[];
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

      setPersonalization: async (enabled) => {
        const operation = ++personalizationOperation;
        const previous = get().personalizationEnabled;
        const userId = get().user?.id;
        set({ personalizationEnabled: enabled });
        if (!userId) return;
        try {
          await usersApi.updateProfile({ personalizationEnabled: enabled });
        } catch {
          if (
            operation === personalizationOperation &&
            get().user?.id === userId
          ) {
            set({ personalizationEnabled: previous });
          }
        }
      },
      clearActivity: async () => {
        const userId = get().user?.id;
        if (userId) {
          await activityApi.clear();
          if (get().user?.id !== userId) return;
        }
        set({
          events: [],
          recentlyViewed: [],
          recentlyViewedReal: [],
          behavioralProfile: null,
          behavioralProfileStatus: "idle",
        });
      },
      setHydrated: () => set({ hydrated: true }),

      // ---- Real session/catalog state ----
      user: null,
      accessToken: null,
      authStatus: "idle",

      login: async (email, password) => {
        const operation = ++authOperation;
        const result = await authApi.login({ email, password });
        if (operation !== authOperation) return;
        set({ accessToken: result.accessToken, authStatus: "checking" });
        try {
          const me = await authApi.me();
          const profile = await usersApi.getProfile();
          if (operation !== authOperation) return;
          set({ user: me, personalizationEnabled: profile.personalizationEnabled, authStatus: "authenticated" });
          void get().fetchServerCart();
          void get().fetchServerWishlist();
          void get().fetchBehavioralProfile();
        } catch (error) {
          if (operation === authOperation) get().clearSession();
          throw error;
        }
      },

      register: async (email, password, name) => {
        const operation = ++authOperation;
        const result = await authApi.register({ email, password, name });
        if (operation !== authOperation) return;
        set({ accessToken: result.accessToken, authStatus: "checking" });
        try {
          const me = await authApi.me();
          const profile = await usersApi.getProfile();
          if (operation !== authOperation) return;
          set({ user: me, personalizationEnabled: profile.personalizationEnabled, authStatus: "authenticated" });
          void get().fetchServerCart();
          void get().fetchServerWishlist();
          void get().fetchBehavioralProfile();
        } catch (error) {
          if (operation === authOperation) get().clearSession();
          throw error;
        }
      },

      logout: async () => {
        const operation = ++authOperation;
        await authApi.logout().catch(() => undefined);
        if (operation === authOperation) get().clearSession();
      },

      clearSession: () => {
        authOperation++;
        personalizationOperation++;
        cartFetchOperation++;
        wishlistFetchOperation++;
        addressFetchOperation++;
        behavioralProfileFetchOperation++;
        set({
          user: null,
          accessToken: null,
          authStatus: "unauthenticated",
          serverCart: null,
          serverCartStatus: "idle",
          serverWishlist: null,
          serverWishlistStatus: "idle",
          serverAddresses: null,
          serverAddressesStatus: "idle",
          behavioralProfile: null,
          behavioralProfileStatus: "idle",
          shopaiConversationId: null,
        });
      },

      exportMyData: () => usersApi.exportData(),

      deleteAccount: async (password) => {
        const userId = get().user?.id;
        await usersApi.deleteAccount({ password });
        if (get().user?.id === userId) get().clearSession();
      },

      serverCart: null,
      serverCartStatus: "idle",

      fetchServerCart: async () => {
        const operation = ++cartFetchOperation;
        const userId = get().user?.id;
        if (!userId) return;
        set({ serverCartStatus: "loading" });
        try {
          const cart = await cartApi.getCart();
          if (operation !== cartFetchOperation || get().user?.id !== userId) return;
          set({ serverCart: cart, serverCartStatus: "idle" });
        } catch {
          if (operation === cartFetchOperation && get().user?.id === userId) {
            set({ serverCartStatus: "error" });
          }
        }
      },

      addServerCartItem: async (variantId, quantity) => {
        const userId = get().user?.id;
        const cart = await cartApi.addItem(variantId, quantity);
        if (get().user?.id !== userId) return;
        set({ serverCart: cart });
        const productId = cart.items.find((i) => i.variantId === variantId)?.productId;
        get().trackRealEvent("PRODUCT_ADDED_TO_CART", productId, { variantId, quantity });
      },

      updateServerCartItem: async (itemId, quantity) => {
        const userId = get().user?.id;
        const cart = await cartApi.updateItem(itemId, quantity);
        if (get().user?.id !== userId) return;
        set({ serverCart: cart });
      },

      removeServerCartItem: async (itemId) => {
        const userId = get().user?.id;
        const productId = get().serverCart?.items.find((i) => i.id === itemId)?.productId;
        const cart = await cartApi.removeItem(itemId);
        if (get().user?.id !== userId) return;
        set({ serverCart: cart });
        get().trackRealEvent("PRODUCT_REMOVED_FROM_CART", productId);
      },

      clearServerCart: async () => {
        const userId = get().user?.id;
        await cartApi.clear();
        if (get().user?.id !== userId) return;
        set({ serverCart: null });
      },

      serverWishlist: null,
      serverWishlistStatus: "idle",

      fetchServerWishlist: async () => {
        const operation = ++wishlistFetchOperation;
        const userId = get().user?.id;
        if (!userId) return;
        set({ serverWishlistStatus: "loading" });
        try {
          const wishlist = await wishlistApi.list();
          if (
            operation !== wishlistFetchOperation ||
            get().user?.id !== userId
          ) {
            return;
          }
          set({ serverWishlist: wishlist, serverWishlistStatus: "idle" });
        } catch {
          if (
            operation === wishlistFetchOperation &&
            get().user?.id === userId
          ) {
            set({ serverWishlistStatus: "error" });
          }
        }
      },

      toggleServerWishlistItem: async (productId) => {
        const userId = get().user?.id;
        const isWishlisted =
          get().serverWishlist?.items.some((i) => i.productId === productId) ?? false;
        const wishlist = isWishlisted
          ? await wishlistApi.remove(productId)
          : await wishlistApi.add(productId);
        if (get().user?.id !== userId) return;
        set({ serverWishlist: wishlist });
        get().trackRealEvent(isWishlisted ? "PRODUCT_REMOVED_FROM_WISHLIST" : "PRODUCT_WISHLISTED", productId);
      },

      serverAddresses: null,
      serverAddressesStatus: "idle",

      fetchServerAddresses: async () => {
        const operation = ++addressFetchOperation;
        const userId = get().user?.id;
        if (!userId) return;
        set({ serverAddressesStatus: "loading" });
        try {
          const addresses = await addressesApi.list();
          if (
            operation !== addressFetchOperation ||
            get().user?.id !== userId
          ) {
            return;
          }
          set({ serverAddresses: addresses, serverAddressesStatus: "idle" });
        } catch {
          if (
            operation === addressFetchOperation &&
            get().user?.id === userId
          ) {
            set({ serverAddressesStatus: "error" });
          }
        }
      },

      createServerAddress: async (input) => {
        const userId = get().user?.id;
        const address = await addressesApi.create(input);
        if (get().user?.id !== userId) return address;
        set((state) => ({
          serverAddresses: address.isDefault
            ? [address, ...(state.serverAddresses ?? []).map((a) => ({ ...a, isDefault: false }))]
            : [...(state.serverAddresses ?? []), address],
        }));
        return address;
      },

      updateServerAddress: async (id, input) => {
        const userId = get().user?.id;
        const address = await addressesApi.update(id, input);
        if (get().user?.id !== userId) return address;
        set((state) => ({
          serverAddresses: (state.serverAddresses ?? []).map((a) =>
            a.id === id ? address : address.isDefault ? { ...a, isDefault: false } : a,
          ),
        }));
        return address;
      },

      removeServerAddress: async (id) => {
        const userId = get().user?.id;
        await addressesApi.remove(id);
        if (get().user?.id !== userId) return;
        set((state) => ({
          serverAddresses: (state.serverAddresses ?? []).filter((a) => a.id !== id),
        }));
      },

      finalizeServerOrder: async (orderId, paymentId, confirmPayload) => {
        const userId = get().user?.id;
        const confirmed = await paymentsApi.confirm(paymentId, confirmPayload);
        if (confirmed.status !== "SUCCEEDED") {
          throw new Error(confirmed.failureReason ?? "Payment was not successful. Please try again.");
        }
        const finalOrder = await ordersApi.get(orderId);
        void get().fetchServerCart();
        if (get().user?.id === userId) {
          get().trackEvent("ORDER_COMPLETED", { metadata: { orderId: finalOrder.id } });
          get().trackRealEvent("ORDER_COMPLETED", finalOrder.id, { total: finalOrder.total });
        }
        return finalOrder;
      },

      anonymousId: null,
      shopaiConversationId: null,

      sendShopAIMessage: async (text) => {
        const userId = get().user?.id;
        get().trackEvent("AI_ASSISTANT_QUERY", { query: text });
        const isGuest = !get().user;
        const anonymousId = isGuest ? get().ensureAnonymousId() : null;
        const identityIsCurrent = () =>
          get().user?.id === userId &&
          (userId !== undefined || get().anonymousId === anonymousId);

        const send = (conversationId?: string) =>
          shopaiApi.sendMessage({
            message: text,
            conversationId,
            anonymousId: anonymousId ?? undefined,
          });

        try {
          const conversationId = get().shopaiConversationId ?? undefined;
          const result = await send(conversationId);
          if (identityIsCurrent()) set({ shopaiConversationId: result.conversationId });
          return result.message;
        } catch (err) {
          if (err instanceof ApiError && err.code === "CONVERSATION_NOT_FOUND") {
            const result = await send(undefined);
            if (identityIsCurrent()) set({ shopaiConversationId: result.conversationId });
            return result.message;
          }
          throw err;
        }
      },

      ensureAnonymousId: () => {
        const existing = get().anonymousId;
        if (existing) return existing;
        const created = crypto.randomUUID();
        set({ anonymousId: created });
        return created;
      },

      trackRealEvent: (eventType, entityId, metadata) => {
        if (!get().personalizationEnabled) return;
        if (eventType === "PRODUCT_VIEWED" && entityId) {
          set((state) => ({
            recentlyViewedReal: [entityId, ...state.recentlyViewedReal.filter((id) => id !== entityId)].slice(0, 20),
          }));
        }
        const anonymousId = get().ensureAnonymousId();
        if (!sessionId) sessionId = crypto.randomUUID();
        void eventsApi
          .track([
            {
              eventId: crypto.randomUUID(),
              eventType,
              anonymousId,
              sessionId,
              source: "WEB",
              entityId,
              metadata,
              occurredAt: new Date().toISOString(),
            },
          ])
          .catch(() => undefined);
      },

      behavioralProfile: null,
      behavioralProfileStatus: "idle",

      fetchBehavioralProfile: async () => {
        const operation = ++behavioralProfileFetchOperation;
        const userId = get().user?.id;
        if (!userId) {
          set({ behavioralProfile: null, behavioralProfileStatus: "idle" });
          return;
        }
        set({ behavioralProfileStatus: "loading" });
        try {
          const { profile } = await activityApi.getBehavioralProfile();
          if (
            operation !== behavioralProfileFetchOperation ||
            get().user?.id !== userId
          ) {
            return;
          }
          set({ behavioralProfile: profile, behavioralProfileStatus: "idle" });
        } catch {
          if (
            operation === behavioralProfileFetchOperation &&
            get().user?.id === userId
          ) {
            set({ behavioralProfileStatus: "error" });
          }
        }
      },

      recentlyViewedReal: [],
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
        anonymousId: state.anonymousId,
        shopaiConversationId: state.shopaiConversationId,
        recentlyViewedReal: state.recentlyViewedReal,
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
