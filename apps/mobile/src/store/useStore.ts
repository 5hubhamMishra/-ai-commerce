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
} from '@ai-commerce/api-client';
import { session } from '../api/session';
import { configureMobileApiClient, mobileRefresh, setAccessToken } from '../api/apiClient';

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
   *  event-tracking infrastructure and this phase doesn't introduce one. */
  placeOrder: (addressId: string, shippingMethod: 'STANDARD' | 'EXPRESS') => Promise<OrderDetail>;

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
    const result = await authApi.login({ email, password });
    setAccessToken(result.accessToken);
    await session.save(result.accessToken, result.refreshToken);
    const me = await authApi.me();
    set({ user: me, authStatus: 'authenticated' });
    void get().fetchCart();
    void get().fetchWishlist();
  },

  register: async (email, password, name) => {
    const result = await authApi.register({ email, password, name });
    setAccessToken(result.accessToken);
    await session.save(result.accessToken, result.refreshToken);
    const me = await authApi.me();
    set({ user: me, authStatus: 'authenticated' });
    void get().fetchCart();
    void get().fetchWishlist();
  },

  logout: async () => {
    const refreshToken = await session.getRefreshToken();
    await authApi.logout(refreshToken ?? undefined).catch(() => undefined);
    await session.clear();
    get().clearSession();
  },

  clearSession: () => {
    setAccessToken(null);
    set({
      user: null,
      authStatus: 'unauthenticated',
      cart: null,
      wishlist: null,
      addresses: null,
      shopaiConversationId: null,
    });
  },

  restoreSession: async () => {
    set({ authStatus: 'checking' });
    const newAccessToken = await mobileRefresh();
    if (!newAccessToken) {
      await session.clear();
      set({ authStatus: 'unauthenticated' });
      return;
    }
    try {
      const me = await authApi.me();
      set({ user: me, authStatus: 'authenticated' });
      void get().fetchCart();
      void get().fetchWishlist();
    } catch {
      await session.clear();
      setAccessToken(null);
      set({ authStatus: 'unauthenticated' });
    }
  },

  cart: null,
  cartStatus: 'idle',

  fetchCart: async () => {
    set({ cartStatus: 'loading' });
    try {
      const cart = await cartApi.getCart();
      set({ cart, cartStatus: 'idle' });
    } catch {
      set({ cartStatus: 'error' });
    }
  },

  addCartItem: async (variantId, quantity) => {
    const cart = await cartApi.addItem(variantId, quantity);
    set({ cart });
  },

  updateCartItem: async (itemId, quantity) => {
    const cart = await cartApi.updateItem(itemId, quantity);
    set({ cart });
  },

  removeCartItem: async (itemId) => {
    const cart = await cartApi.removeItem(itemId);
    set({ cart });
  },

  wishlist: null,
  wishlistStatus: 'idle',

  fetchWishlist: async () => {
    set({ wishlistStatus: 'loading' });
    try {
      const wishlist = await wishlistApi.list();
      set({ wishlist, wishlistStatus: 'idle' });
    } catch {
      set({ wishlistStatus: 'error' });
    }
  },

  toggleWishlistItem: async (productId) => {
    const isWishlisted = get().wishlist?.items.some((i) => i.productId === productId) ?? false;
    const wishlist = isWishlisted ? await wishlistApi.remove(productId) : await wishlistApi.add(productId);
    set({ wishlist });
  },

  addresses: null,
  addressesStatus: 'idle',

  fetchAddresses: async () => {
    set({ addressesStatus: 'loading' });
    try {
      const addresses = await addressesApi.list();
      set({ addresses, addressesStatus: 'idle' });
    } catch {
      set({ addressesStatus: 'error' });
    }
  },

  createAddress: async (input) => {
    const address = await addressesApi.create(input);
    set((state) => ({
      addresses: address.isDefault
        ? [address, ...(state.addresses ?? []).map((a) => ({ ...a, isDefault: false }))]
        : [...(state.addresses ?? []), address],
    }));
    return address;
  },

  placeOrder: async (addressId, shippingMethod) => {
    const created = await ordersApi.create({ addressId, shippingMethod });
    const payment = await paymentsApi.create(created.id);
    await paymentsApi.confirm(payment.paymentId);
    const finalOrder = await ordersApi.get(created.id);
    void get().fetchCart(); // apps/api already clears the cart server-side as part of order creation
    return finalOrder;
  },

  shopaiConversationId: null,

  sendShopAIMessage: async (text) => {
    const send = (conversationId?: string) => shopaiApi.sendMessage({ message: text, conversationId });
    try {
      const conversationId = get().shopaiConversationId ?? undefined;
      const result = await send(conversationId);
      set({ shopaiConversationId: result.conversationId });
      return result.message;
    } catch (err) {
      if (err instanceof ApiError && err.code === 'CONVERSATION_NOT_FOUND') {
        const result = await send(undefined);
        set({ shopaiConversationId: result.conversationId });
        return result.message;
      }
      throw err;
    }
  },
}));

configureMobileApiClient(() => useStore.getState().clearSession());
