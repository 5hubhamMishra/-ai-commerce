import { create } from 'zustand';
import type {
  Address,
  CartResponse,
  CreateAddressInput,
  OrderDetail,
  PublicUser,
  ShopAIMessage,
  WishlistResponse,
} from '@ai-commerce/types';
import {
  ApiError,
  addressesApi,
  authApi,
  cartApi,
  ordersApi,
  paymentsApi,
  shopaiApi,
  wishlistApi,
  refreshAccessToken,
} from '@ai-commerce/api-client';
import { session } from '../api/session';
import { configureMobileApiClient, setAccessToken } from '../api/apiClient';

let authOperation = 0;

export type AuthStatus = 'idle' | 'checking' | 'authenticated' | 'unauthenticated';
type AsyncStatus = 'idle' | 'loading' | 'error';

type StoreState = {
  user: PublicUser | null;
  authStatus: AuthStatus;

  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name: string) => Promise<void>;
  logout: () => Promise<void>;
  /** Sync — clears session state without a network call (used after a failed refresh, or
   *  internally by logout()). */
  clearSession: () => void;
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
   *  refetch final order), minus the analytics calls web fires around it — mobile has no
   *  event-tracking infrastructure and this phase doesn't introduce one. Used for the
   *  simulated dev-adapter path only; the real-payment path uses finalizeOrder below,
   *  since a Razorpay confirmation needs a widget interaction in between order/payment
   *  creation and confirm that a single store action can't drive itself. */
  placeOrder: (addressId: string, shippingMethod: 'STANDARD' | 'EXPRESS') => Promise<OrderDetail>;

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
  /** Mirrors apps/web's sendShopAIMessage, minus the guest/anonymousId path — every screen that
   *  can reach this action is already behind RootNavigator's authenticated gate, so there is no
   *  logged-out caller on mobile to give an anonymous id to — and minus the analytics call web
   *  fires around it, for the same reason as placeOrder above. */
  sendShopAIMessage: (text: string) => Promise<ShopAIMessage>;
};

export const useStore = create<StoreState>((set, get) => ({
  user: null,
  authStatus: 'idle',

  login: async (email, password) => {
    const operation = ++authOperation;
    const result = await authApi.login({ email, password });
    if (operation !== authOperation) return;
    setAccessToken(result.accessToken);
    await session.save(result.accessToken, result.refreshToken);
    if (operation !== authOperation) return;
    const me = await authApi.me();
    if (operation !== authOperation) return;
    set({ user: me, authStatus: 'authenticated' });
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
    set({ user: me, authStatus: 'authenticated' });
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
      authStatus: 'unauthenticated',
      cart: null,
      cartStatus: 'idle',
      wishlist: null,
      wishlistStatus: 'idle',
      addresses: null,
      addressesStatus: 'idle',
      shopaiConversationId: null,
    });
  },

  restoreSession: async () => {
    const operation = ++authOperation;
    set({ authStatus: 'checking' });
    const newAccessToken = await refreshAccessToken();
    if (operation !== authOperation) return;
    if (!newAccessToken) {
      await session.clear();
      if (operation === authOperation) set({ authStatus: 'unauthenticated' });
      return;
    }
    try {
      const me = await authApi.me();
      if (operation !== authOperation) return;
      set({ user: me, authStatus: 'authenticated' });
      void get().fetchCart();
      void get().fetchWishlist();
    } catch {
      if (operation !== authOperation) return;
      await session.clear();
      if (operation !== authOperation) return;
      setAccessToken(null);
      set({ authStatus: 'unauthenticated' });
    }
  },

  cart: null,
  cartStatus: 'idle',

  fetchCart: async () => {
    const operation = authOperation;
    set({ cartStatus: 'loading' });
    try {
      const cart = await cartApi.getCart();
      if (operation !== authOperation) return;
      set({ cart, cartStatus: 'idle' });
    } catch {
      if (operation !== authOperation) return;
      set({ cartStatus: 'error' });
    }
  },

  addCartItem: async (variantId, quantity) => {
    const operation = authOperation;
    const cart = await cartApi.addItem(variantId, quantity);
    if (operation !== authOperation) throw new Error('Session changed.');
    set({ cart });
  },

  updateCartItem: async (itemId, quantity) => {
    const operation = authOperation;
    const cart = await cartApi.updateItem(itemId, quantity);
    if (operation !== authOperation) throw new Error('Session changed.');
    set({ cart });
  },

  removeCartItem: async (itemId) => {
    const operation = authOperation;
    const cart = await cartApi.removeItem(itemId);
    if (operation !== authOperation) throw new Error('Session changed.');
    set({ cart });
  },

  wishlist: null,
  wishlistStatus: 'idle',

  fetchWishlist: async () => {
    const operation = authOperation;
    set({ wishlistStatus: 'loading' });
    try {
      const wishlist = await wishlistApi.list();
      if (operation !== authOperation) return;
      set({ wishlist, wishlistStatus: 'idle' });
    } catch {
      if (operation !== authOperation) return;
      set({ wishlistStatus: 'error' });
    }
  },

  toggleWishlistItem: async (productId) => {
    const operation = authOperation;
    const isWishlisted = get().wishlist?.items.some((i) => i.productId === productId) ?? false;
    const wishlist = isWishlisted ? await wishlistApi.remove(productId) : await wishlistApi.add(productId);
    if (operation !== authOperation) throw new Error('Session changed.');
    set({ wishlist });
  },

  addresses: null,
  addressesStatus: 'idle',

  fetchAddresses: async () => {
    const operation = authOperation;
    set({ addressesStatus: 'loading' });
    try {
      const addresses = await addressesApi.list();
      if (operation !== authOperation) return;
      set({ addresses, addressesStatus: 'idle' });
    } catch {
      if (operation !== authOperation) return;
      set({ addressesStatus: 'error' });
    }
  },

  createAddress: async (input) => {
    const operation = authOperation;
    const address = await addressesApi.create(input);
    if (operation !== authOperation) throw new Error('Session changed.');
    set((state) => ({
      addresses: address.isDefault
        ? [address, ...(state.addresses ?? []).map((a) => ({ ...a, isDefault: false }))]
        : [...(state.addresses ?? []), address],
    }));
    return address;
  },

  placeOrder: async (addressId, shippingMethod) => {
    const operation = authOperation;
    const created = await ordersApi.create({ addressId, shippingMethod });
    if (operation !== authOperation) throw new Error('Session changed.');
    const payment = await paymentsApi.create(created.id);
    if (operation !== authOperation) throw new Error('Session changed.');
    if (payment.provider === 'RAZORPAY') {
      throw new Error('Online payment is required for this order.');
    }
    const confirmed = await paymentsApi.confirm(payment.paymentId);
    if (operation !== authOperation) throw new Error('Session changed.');
    if (confirmed.status !== 'SUCCEEDED') {
      throw new Error(confirmed.failureReason ?? 'Payment was not successful. Please try again.');
    }
    const finalOrder = await ordersApi.get(created.id);
    if (operation !== authOperation) throw new Error('Session changed.');
    void get().fetchCart(); // apps/api already clears the cart server-side as part of order creation
    return finalOrder;
  },

  finalizeOrder: async (orderId, paymentId, confirmPayload) => {
    const operation = authOperation;
    const confirmed = await paymentsApi.confirm(paymentId, confirmPayload);
    if (operation !== authOperation) throw new Error('Session changed.');
    if (confirmed.status !== 'SUCCEEDED') {
      throw new Error(confirmed.failureReason ?? 'Payment was not successful. Please try again.');
    }
    const finalOrder = await ordersApi.get(orderId);
    if (operation !== authOperation) throw new Error('Session changed.');
    void get().fetchCart();
    return finalOrder;
  },

  shopaiConversationId: null,

  sendShopAIMessage: async (text) => {
    const operation = authOperation;
    const send = (conversationId?: string) => shopaiApi.sendMessage({ message: text, conversationId });
    try {
      const conversationId = get().shopaiConversationId ?? undefined;
      const result = await send(conversationId);
      if (operation !== authOperation) throw new Error('Session changed.');
      set({ shopaiConversationId: result.conversationId });
      return result.message;
    } catch (err) {
      if (operation !== authOperation) throw new Error('Session changed.');
      if (err instanceof ApiError && err.code === 'CONVERSATION_NOT_FOUND') {
        const result = await send(undefined);
        if (operation !== authOperation) throw new Error('Session changed.');
        set({ shopaiConversationId: result.conversationId });
        return result.message;
      }
      throw err;
    }
  },
}));

configureMobileApiClient(() => useStore.getState().clearSession());
