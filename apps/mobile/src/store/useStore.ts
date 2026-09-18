import { create } from "zustand";
import type {
  Address,
  BehavioralEventType,
  CartResponse,
  CreateAddressInput,
  ExportDataResponse,
  OrderDetail,
  PublicUser,
  ShopAIMessage,
  WishlistResponse,
} from "@ai-commerce/types";
import {
  ApiError,
  addressesApi,
  authApi,
  cartApi,
  eventsApi,
  ordersApi,
  paymentsApi,
  shopaiApi,
  usersApi,
  wishlistApi,
  refreshAccessToken,
} from "@ai-commerce/api-client";
import { session } from "../api/session";
import { configureMobileApiClient, setAccessToken } from "../api/apiClient";

let authOperation = 0;
const mobileAnonymousId = crypto.randomUUID();
const mobileSessionId = crypto.randomUUID();

export type AuthStatus =
  "idle" | "checking" | "authenticated" | "unauthenticated";
type AsyncStatus = "idle" | "loading" | "error";

type StoreState = {
  user: PublicUser | null;
  authStatus: AuthStatus;

  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name: string) => Promise<void>;
  logout: () => Promise<void>;
  /** Sync — clears session state without a network call (used after a failed refresh, or
   *  internally by logout()). */
  clearSession: () => void;
  exportMyData: () => Promise<ExportDataResponse>;
  deleteAccount: (password: string) => Promise<void>;
  /** Sends a best-effort behavioral event for authenticated mobile sessions. */
  trackEvent: (
    eventType: BehavioralEventType,
    entityId?: string,
    metadata?: Record<string, unknown>,
  ) => void;
  /** Silently exchanges a stored refresh token for a fresh session on app launch — today's
   *  App.tsx only checked *presence* of an access token and never refreshed an expired one,
   *  so restoring a session on cold start (rather than just gating on a stale token) is a
   *  real correctness fix, mirroring apps/web's SessionProvider.tsx. */
  restoreSession: () => Promise<void>;

  cart: CartResponse | null;
  cartStatus: AsyncStatus;
  fetchCart: () => Promise<void>;
  addCartItem: (variantId: string, quantity: number) => Promise<void>;
  updateCartItem: (itemId: string, quantity: number) => Promise<void>;
  removeCartItem: (itemId: string) => Promise<void>;

  wishlist: WishlistResponse | null;
  wishlistStatus: AsyncStatus;
  fetchWishlist: () => Promise<void>;
  toggleWishlistItem: (productId: string) => Promise<void>;

  addresses: Address[] | null;
  addressesStatus: AsyncStatus;
  fetchAddresses: () => Promise<void>;
  createAddress: (input: CreateAddressInput) => Promise<Address>;

  /** Mirrors apps/web's placeServerOrder (create -> payment create -> payment confirm ->
   *  refetch final order), including the mobile behavioral event. Used for the simulated
   *  dev-adapter path only; the real-payment path uses finalizeOrder below,
   *  since a Razorpay confirmation needs a widget interaction in between order/payment
   *  creation and confirm that a single store action can't drive itself. */
  placeOrder: (
    addressId: string,
    shippingMethod: "STANDARD" | "EXPRESS",
    idempotencyKey?: string,
  ) => Promise<OrderDetail>;

  /** Mirrors apps/web's finalizeServerOrder: confirms an already-created payment (the screen
   *  owns order/payment *creation* itself for this path, since opening the Razorpay widget has
   *  to happen between create and confirm), then refetches the cart (apps/api already cleared
   *  it server-side as part of order creation) and returns the final order detail. Throws if
   *  the confirm outcome isn't SUCCEEDED — a real provider can legitimately return a failed
   *  confirmation as an ordinary response (tampered/expired signature). */
  finalizeOrder: (
    orderId: string,
    paymentId: string,
    confirmPayload?: { razorpayPaymentId?: string; razorpaySignature?: string },
  ) => Promise<OrderDetail>;

  shopaiConversationId: string | null;
  /** Mirrors apps/web's sendShopAIMessage; mobile records the authenticated query event. */
  sendShopAIMessage: (text: string) => Promise<ShopAIMessage>;
};

export const useStore = create<StoreState>((set, get) => ({
  user: null,
  authStatus: "idle",

  login: async (email, password) => {
    const operation = ++authOperation;
    const result = await authApi.login({ email, password });
    if (operation !== authOperation) return;
    setAccessToken(result.accessToken);
    await session.save(result.accessToken, result.refreshToken);
    if (operation !== authOperation) return;
    const me = await authApi.me();
    if (operation !== authOperation) return;
    set({ user: me, authStatus: "authenticated" });
    void get().fetchCart();
    void get().fetchWishlist();
  },

  register: async (email, password, name) => {
    const operation = ++authOperation;
    const result = await authApi.register({ email, password, name });
    if (operation !== authOperation) return;
    setAccessToken(result.accessToken);
    await session.save(result.accessToken, result.refreshToken);
    if (operation !== authOperation) return;
    const me = await authApi.me();
    if (operation !== authOperation) return;
    set({ user: me, authStatus: "authenticated" });
    void get().fetchCart();
    void get().fetchWishlist();
  },

  logout: async () => {
    const operation = ++authOperation;
    const refreshToken = await session.getRefreshToken();
    await authApi.logout(refreshToken ?? undefined).catch(() => undefined);
    if (operation !== authOperation) return;
    await session.clear();
    if (operation === authOperation) get().clearSession();
  },

  clearSession: () => {
    authOperation++;
    setAccessToken(null);
    set({
      user: null,
      authStatus: "unauthenticated",
      cart: null,
      cartStatus: "idle",
      wishlist: null,
      wishlistStatus: "idle",
      addresses: null,
      addressesStatus: "idle",
      shopaiConversationId: null,
    });
  },

  exportMyData: () => usersApi.exportData(),

  deleteAccount: async (password) => {
    const operation = authOperation;
    await usersApi.deleteAccount({ password });
    if (operation !== authOperation) return;
    await session.clear();
    if (operation === authOperation) get().clearSession();
  },

  trackEvent: (eventType, entityId, metadata) => {
    if (!get().user) return;
    void eventsApi
      .track([
        {
          eventId: crypto.randomUUID(),
          eventType,
          anonymousId: mobileAnonymousId,
          sessionId: mobileSessionId,
          source: 'MOBILE',
          entityId,
          metadata,
          occurredAt: new Date().toISOString(),
        },
      ])
      .catch(() => undefined);
  },

  restoreSession: async () => {
    const operation = ++authOperation;
    set({ authStatus: "checking" });
    const newAccessToken = await refreshAccessToken();
    if (operation !== authOperation) return;
    if (!newAccessToken) {
      await session.clear();
      if (operation === authOperation) set({ authStatus: "unauthenticated" });
      return;
    }
    try {
      const me = await authApi.me();
      if (operation !== authOperation) return;
      set({ user: me, authStatus: "authenticated" });
      void get().fetchCart();
      void get().fetchWishlist();
    } catch {
      if (operation !== authOperation) return;
      await session.clear();
      if (operation !== authOperation) return;
      setAccessToken(null);
      set({ authStatus: "unauthenticated" });
    }
  },

  cart: null,
  cartStatus: "idle",

  fetchCart: async () => {
    const operation = authOperation;
    set({ cartStatus: "loading" });
    try {
      const cart = await cartApi.getCart();
      if (operation !== authOperation) return;
      set({ cart, cartStatus: "idle" });
    } catch {
      if (operation !== authOperation) return;
      set({ cartStatus: "error" });
    }
  },

  addCartItem: async (variantId, quantity) => {
    const operation = authOperation;
    const cart = await cartApi.addItem(variantId, quantity);
    if (operation !== authOperation) throw new Error("Session changed.");
    set({ cart });
    get().trackEvent('PRODUCT_ADDED_TO_CART', undefined, { variantId, quantity });
  },

  updateCartItem: async (itemId, quantity) => {
    const operation = authOperation;
    const cart = await cartApi.updateItem(itemId, quantity);
    if (operation !== authOperation) throw new Error("Session changed.");
    set({ cart });
  },

  removeCartItem: async (itemId) => {
    const operation = authOperation;
    const productId = get().cart?.items.find((item) => item.id === itemId)?.productId;
    const cart = await cartApi.removeItem(itemId);
    if (operation !== authOperation) throw new Error("Session changed.");
    set({ cart });
    get().trackEvent('PRODUCT_REMOVED_FROM_CART', productId, { itemId });
  },

  wishlist: null,
  wishlistStatus: "idle",

  fetchWishlist: async () => {
    const operation = authOperation;
    set({ wishlistStatus: "loading" });
    try {
      const wishlist = await wishlistApi.list();
      if (operation !== authOperation) return;
      set({ wishlist, wishlistStatus: "idle" });
    } catch {
      if (operation !== authOperation) return;
      set({ wishlistStatus: "error" });
    }
  },

  toggleWishlistItem: async (productId) => {
    const operation = authOperation;
    const isWishlisted =
      get().wishlist?.items.some((i) => i.productId === productId) ?? false;
    const wishlist = isWishlisted
      ? await wishlistApi.remove(productId)
      : await wishlistApi.add(productId);
    if (operation !== authOperation) throw new Error("Session changed.");
    set({ wishlist });
    get().trackEvent(
      isWishlisted ? 'PRODUCT_REMOVED_FROM_WISHLIST' : 'PRODUCT_WISHLISTED',
      productId,
    );
  },

  addresses: null,
  addressesStatus: "idle",

  fetchAddresses: async () => {
    const operation = authOperation;
    set({ addressesStatus: "loading" });
    try {
      const addresses = await addressesApi.list();
      if (operation !== authOperation) return;
      set({ addresses, addressesStatus: "idle" });
    } catch {
      if (operation !== authOperation) return;
      set({ addressesStatus: "error" });
    }
  },

  createAddress: async (input) => {
    const operation = authOperation;
    const address = await addressesApi.create(input);
    if (operation !== authOperation) throw new Error("Session changed.");
    set((state) => ({
      addresses: address.isDefault
        ? [
            address,
            ...(state.addresses ?? []).map((a) => ({ ...a, isDefault: false })),
          ]
        : [...(state.addresses ?? []), address],
    }));
    return address;
  },

  placeOrder: async (addressId, shippingMethod, idempotencyKey) => {
    const operation = authOperation;
    const input = { addressId, shippingMethod };
    const created = idempotencyKey
      ? await ordersApi.create(input, idempotencyKey)
      : await ordersApi.create(input);
    if (operation !== authOperation) throw new Error("Session changed.");
    const payment = await paymentsApi.create(created.id);
    if (operation !== authOperation) throw new Error("Session changed.");
    if (payment.provider === "RAZORPAY") {
      throw new Error("Online payment is required for this order.");
    }
    const confirmed = await paymentsApi.confirm(payment.paymentId);
    if (operation !== authOperation) throw new Error("Session changed.");
    if (confirmed.status !== "SUCCEEDED") {
      throw new Error(
        confirmed.failureReason ??
          "Payment was not successful. Please try again.",
      );
    }
    const finalOrder = await ordersApi.get(created.id);
    if (operation !== authOperation) throw new Error("Session changed.");
    void get().fetchCart(); // apps/api already clears the cart server-side as part of order creation
    get().trackEvent('ORDER_COMPLETED', finalOrder.id, { total: finalOrder.total });
    return finalOrder;
  },

  finalizeOrder: async (orderId, paymentId, confirmPayload) => {
    const operation = authOperation;
    const confirmed = await paymentsApi.confirm(paymentId, confirmPayload);
    if (operation !== authOperation) throw new Error("Session changed.");
    if (confirmed.status !== "SUCCEEDED") {
      const error = new Error(
        confirmed.failureReason ??
          "Payment was not successful. Please try again.",
      ) as Error & { paymentFailed?: boolean };
      error.paymentFailed = true;
      throw error;
    }
    const finalOrder = await ordersApi.get(orderId);
    if (operation !== authOperation) throw new Error("Session changed.");
    void get().fetchCart();
    get().trackEvent('ORDER_COMPLETED', finalOrder.id, { total: finalOrder.total });
    return finalOrder;
  },

  shopaiConversationId: null,

  sendShopAIMessage: async (text) => {
    const operation = authOperation;
    get().trackEvent('AI_ASSISTANT_QUERY', undefined, { query: text });
    const send = (conversationId?: string) =>
      shopaiApi.sendMessage({ message: text, conversationId });
    try {
      const conversationId = get().shopaiConversationId ?? undefined;
      const result = await send(conversationId);
      if (operation !== authOperation) throw new Error("Session changed.");
      set({ shopaiConversationId: result.conversationId });
      return result.message;
    } catch (err) {
      if (operation !== authOperation) throw new Error("Session changed.");
      if (err instanceof ApiError && err.code === "CONVERSATION_NOT_FOUND") {
        const result = await send(undefined);
        if (operation !== authOperation) throw new Error("Session changed.");
        set({ shopaiConversationId: result.conversationId });
        return result.message;
      }
      throw err;
    }
  },
}));

configureMobileApiClient(() => useStore.getState().clearSession());
