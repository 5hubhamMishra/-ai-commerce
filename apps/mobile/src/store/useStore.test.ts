import { waitFor } from '@testing-library/react-native';
import type { PublicUser } from '@ai-commerce/types';
import { ApiError, addressesApi, authApi, cartApi, ordersApi, paymentsApi, shopaiApi, wishlistApi } from '@ai-commerce/api-client';
import { session } from '../api/session';
import { mobileRefresh, setAccessToken } from '../api/apiClient';
import { useStore } from './useStore';

jest.mock('@ai-commerce/api-client', () => {
  const actual = jest.requireActual('@ai-commerce/api-client');
  return {
    ApiError: actual.ApiError,
    authApi: { login: jest.fn(), register: jest.fn(), logout: jest.fn(), me: jest.fn() },
    cartApi: { getCart: jest.fn(), addItem: jest.fn(), updateItem: jest.fn(), removeItem: jest.fn() },
    wishlistApi: { list: jest.fn(), add: jest.fn(), remove: jest.fn() },
    addressesApi: { list: jest.fn(), create: jest.fn() },
    ordersApi: { create: jest.fn(), get: jest.fn() },
    paymentsApi: { create: jest.fn(), confirm: jest.fn() },
    shopaiApi: { sendMessage: jest.fn(), getConversation: jest.fn() },
  };
});
jest.mock('../api/session', () => ({
  session: { save: jest.fn(), getRefreshToken: jest.fn(), clear: jest.fn() },
}));
jest.mock('../api/apiClient', () => ({
  configureMobileApiClient: jest.fn(),
  mobileRefresh: jest.fn(),
  setAccessToken: jest.fn(),
}));

const publicUser: PublicUser = {
  id: 'u1',
  email: 'ada@example.com',
  name: 'Ada',
  isActive: true,
  createdAt: '2026-01-01T00:00:00.000Z',
  roles: ['CUSTOMER'],
};

const emptyCart = { id: 'cart-1', items: [], itemCount: 0, subtotal: 0, currency: 'INR', hasUnavailableItems: false };
const emptyWishlist = { items: [] };

const initialState = useStore.getState();

beforeEach(() => {
  jest.clearAllMocks();
  useStore.setState(
    {
      ...initialState,
      user: null,
      authStatus: 'idle',
      cart: null,
      wishlist: null,
      addresses: null,
      shopaiConversationId: null,
    },
    true,
  );
});

describe('auth actions', () => {
  it('login stores the user, persists tokens, and fetches cart/wishlist', async () => {
    (authApi.login as jest.Mock).mockResolvedValue({ accessToken: 'tok-1', refreshToken: 'r1' });
    (authApi.me as jest.Mock).mockResolvedValue(publicUser);
    (cartApi.getCart as jest.Mock).mockResolvedValue(emptyCart);
    (wishlistApi.list as jest.Mock).mockResolvedValue(emptyWishlist);

    await useStore.getState().login('ada@example.com', 'password123');

    expect(authApi.login).toHaveBeenCalledWith({ email: 'ada@example.com', password: 'password123' });
    expect(setAccessToken).toHaveBeenCalledWith('tok-1');
    expect(session.save).toHaveBeenCalledWith('tok-1', 'r1');
    expect(useStore.getState().user).toEqual(publicUser);
    expect(useStore.getState().authStatus).toBe('authenticated');

    await waitFor(() => expect(cartApi.getCart).toHaveBeenCalled());
    expect(wishlistApi.list).toHaveBeenCalled();
  });

  it('a failed login throws and leaves the session unauthenticated', async () => {
    (authApi.login as jest.Mock).mockRejectedValue(new Error('Incorrect email or password.'));

    await expect(useStore.getState().login('ada@example.com', 'wrong')).rejects.toThrow(
      'Incorrect email or password.',
    );
    expect(useStore.getState().user).toBeNull();
    expect(useStore.getState().authStatus).not.toBe('authenticated');
  });

  it('register stores the user the same way login does', async () => {
    (authApi.register as jest.Mock).mockResolvedValue({ accessToken: 'tok-1', refreshToken: 'r1' });
    (authApi.me as jest.Mock).mockResolvedValue(publicUser);
    (cartApi.getCart as jest.Mock).mockResolvedValue(emptyCart);
    (wishlistApi.list as jest.Mock).mockResolvedValue(emptyWishlist);

    await useStore.getState().register('ada@example.com', 'password123', 'Ada');

    expect(authApi.register).toHaveBeenCalledWith({ email: 'ada@example.com', password: 'password123', name: 'Ada' });
    expect(useStore.getState().user).toEqual(publicUser);
    expect(useStore.getState().authStatus).toBe('authenticated');
  });

  it('logout clears tokens, storage, and store state', async () => {
    useStore.setState({
      user: publicUser,
      authStatus: 'authenticated',
      cart: emptyCart,
      wishlist: emptyWishlist,
      addresses: [],
      shopaiConversationId: 'conv-1',
    });
    (session.getRefreshToken as jest.Mock).mockResolvedValue('r1');
    (authApi.logout as jest.Mock).mockResolvedValue(undefined);

    await useStore.getState().logout();

    expect(authApi.logout).toHaveBeenCalledWith('r1');
    expect(session.clear).toHaveBeenCalled();
    expect(setAccessToken).toHaveBeenCalledWith(null);
    expect(useStore.getState().user).toBeNull();
    expect(useStore.getState().authStatus).toBe('unauthenticated');
    expect(useStore.getState().cart).toBeNull();
    expect(useStore.getState().wishlist).toBeNull();
    expect(useStore.getState().addresses).toBeNull();
    expect(useStore.getState().shopaiConversationId).toBeNull();
  });

  it('logout still clears local session state even if the server call fails', async () => {
    useStore.setState({ user: publicUser, authStatus: 'authenticated' });
    (session.getRefreshToken as jest.Mock).mockResolvedValue('r1');
    (authApi.logout as jest.Mock).mockRejectedValue(new Error('network error'));

    await useStore.getState().logout();

    expect(useStore.getState().authStatus).toBe('unauthenticated');
  });

  describe('restoreSession', () => {
    it('restores the user when a stored refresh token is still valid', async () => {
      (mobileRefresh as jest.Mock).mockResolvedValue('access-new');
      (authApi.me as jest.Mock).mockResolvedValue(publicUser);
      (cartApi.getCart as jest.Mock).mockResolvedValue(emptyCart);
      (wishlistApi.list as jest.Mock).mockResolvedValue(emptyWishlist);

      await useStore.getState().restoreSession();

      expect(useStore.getState().user).toEqual(publicUser);
      expect(useStore.getState().authStatus).toBe('authenticated');
    });

    it('goes unauthenticated without calling /me when there is no valid refresh token', async () => {
      (mobileRefresh as jest.Mock).mockResolvedValue(null);

      await useStore.getState().restoreSession();

      expect(authApi.me).not.toHaveBeenCalled();
      expect(session.clear).toHaveBeenCalled();
      expect(useStore.getState().authStatus).toBe('unauthenticated');
    });

    it('clears the session if /me fails even after a successful token refresh', async () => {
      (mobileRefresh as jest.Mock).mockResolvedValue('access-new');
      (authApi.me as jest.Mock).mockRejectedValue(new Error('unauthorized'));

      await useStore.getState().restoreSession();

      expect(session.clear).toHaveBeenCalled();
      expect(useStore.getState().authStatus).toBe('unauthenticated');
    });

    it('does not restore a session after the current session is cleared', async () => {
      let resolveRefresh!: (token: string | null) => void;
      const refresh = new Promise<string | null>((resolve) => {
        resolveRefresh = resolve;
      });
      (mobileRefresh as jest.Mock).mockReturnValue(refresh);

      const restoring = useStore.getState().restoreSession();
      await waitFor(() => expect(mobileRefresh).toHaveBeenCalled());
      useStore.getState().clearSession();
      resolveRefresh('stale-access');
      await restoring;

      expect(authApi.me).not.toHaveBeenCalled();
      expect(useStore.getState().user).toBeNull();
      expect(useStore.getState().authStatus).toBe('unauthenticated');
    });
  });
});

describe('cart actions', () => {
  it('fetchCart loads the server cart', async () => {
    (cartApi.getCart as jest.Mock).mockResolvedValue(emptyCart);

    await useStore.getState().fetchCart();

    expect(useStore.getState().cart).toEqual(emptyCart);
    expect(useStore.getState().cartStatus).toBe('idle');
  });

  it('fetchCart sets an error status on failure', async () => {
    (cartApi.getCart as jest.Mock).mockRejectedValue(new Error('network error'));

    await useStore.getState().fetchCart();

    expect(useStore.getState().cartStatus).toBe('error');
  });

  it('addCartItem stores the cart the API returns', async () => {
    const cart = { ...emptyCart, itemCount: 1 };
    (cartApi.addItem as jest.Mock).mockResolvedValue(cart);

    await useStore.getState().addCartItem('variant-1', 2);

    expect(cartApi.addItem).toHaveBeenCalledWith('variant-1', 2);
    expect(useStore.getState().cart).toEqual(cart);
  });

  it('updateCartItem and removeCartItem replace the cart with the API response', async () => {
    const updated = { ...emptyCart, itemCount: 3 };
    (cartApi.updateItem as jest.Mock).mockResolvedValue(updated);
    await useStore.getState().updateCartItem('item-1', 3);
    expect(useStore.getState().cart).toEqual(updated);

    (cartApi.removeItem as jest.Mock).mockResolvedValue(emptyCart);
    await useStore.getState().removeCartItem('item-1');
    expect(useStore.getState().cart).toEqual(emptyCart);
  });
});

describe('wishlist actions', () => {
  it('fetchWishlist loads the server wishlist', async () => {
    (wishlistApi.list as jest.Mock).mockResolvedValue(emptyWishlist);

    await useStore.getState().fetchWishlist();

    expect(useStore.getState().wishlist).toEqual(emptyWishlist);
  });

  it('toggleWishlistItem adds when absent and removes when present', async () => {
    const withItem = { items: [{ productId: 'p1' }] };
    (wishlistApi.add as jest.Mock).mockResolvedValue(withItem);

    await useStore.getState().toggleWishlistItem('p1');
    expect(wishlistApi.add).toHaveBeenCalledWith('p1');
    expect(useStore.getState().wishlist).toEqual(withItem);

    (wishlistApi.remove as jest.Mock).mockResolvedValue(emptyWishlist);
    await useStore.getState().toggleWishlistItem('p1');
    expect(wishlistApi.remove).toHaveBeenCalledWith('p1');
    expect(useStore.getState().wishlist).toEqual(emptyWishlist);
  });
});

const address = {
  id: 'addr-1',
  userId: 'u1',
  label: 'Home',
  line1: '221B Baker Street',
  line2: null,
  city: 'Mumbai',
  state: 'Maharashtra',
  postalCode: '400001',
  country: 'India',
  isDefault: true,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

describe('address actions', () => {
  it('fetchAddresses loads the server address list', async () => {
    (addressesApi.list as jest.Mock).mockResolvedValue([address]);

    await useStore.getState().fetchAddresses();

    expect(useStore.getState().addresses).toEqual([address]);
    expect(useStore.getState().addressesStatus).toBe('idle');
  });

  it('fetchAddresses sets an error status on failure', async () => {
    (addressesApi.list as jest.Mock).mockRejectedValue(new Error('network error'));

    await useStore.getState().fetchAddresses();

    expect(useStore.getState().addressesStatus).toBe('error');
  });

  it('createAddress appends a non-default address to the existing list', async () => {
    useStore.setState({ addresses: [address] });
    const nonDefault = { ...address, id: 'addr-2', isDefault: false };
    (addressesApi.create as jest.Mock).mockResolvedValue(nonDefault);

    const created = await useStore.getState().createAddress({
      line1: nonDefault.line1,
      city: nonDefault.city,
      state: nonDefault.state,
      postalCode: nonDefault.postalCode,
      country: nonDefault.country,
    });

    expect(created).toEqual(nonDefault);
    expect(useStore.getState().addresses).toEqual([address, nonDefault]);
  });

  it('createAddress prepends a new default address and un-defaults the others', async () => {
    useStore.setState({ addresses: [address] });
    const newDefault = { ...address, id: 'addr-2', isDefault: true };
    (addressesApi.create as jest.Mock).mockResolvedValue(newDefault);

    await useStore.getState().createAddress({
      line1: newDefault.line1,
      city: newDefault.city,
      state: newDefault.state,
      postalCode: newDefault.postalCode,
      country: newDefault.country,
      isDefault: true,
    });

    expect(useStore.getState().addresses).toEqual([newDefault, { ...address, isDefault: false }]);
  });
});

describe('placeOrder', () => {
  it('orchestrates create-order -> create-payment -> confirm-payment -> refetch, and refetches the cart', async () => {
    const pendingOrder = { id: 'ord-1', status: 'PENDING_PAYMENT', total: 500 };
    const confirmedOrder = { id: 'ord-1', status: 'CONFIRMED', total: 500 };
    (ordersApi.create as jest.Mock).mockResolvedValue(pendingOrder);
    (paymentsApi.create as jest.Mock).mockResolvedValue({ paymentId: 'pay-1' });
    (paymentsApi.confirm as jest.Mock).mockResolvedValue({ status: 'SUCCEEDED' });
    (ordersApi.get as jest.Mock).mockResolvedValue(confirmedOrder);
    (cartApi.getCart as jest.Mock).mockResolvedValue(emptyCart);

    const result = await useStore.getState().placeOrder('addr-1', 'STANDARD');

    expect(ordersApi.create).toHaveBeenCalledWith({ addressId: 'addr-1', shippingMethod: 'STANDARD' });
    expect(paymentsApi.create).toHaveBeenCalledWith('ord-1');
    expect(paymentsApi.confirm).toHaveBeenCalledWith('pay-1');
    expect(ordersApi.get).toHaveBeenCalledWith('ord-1');
    expect(result).toEqual(confirmedOrder);

    // fetchCart() is fired but not awaited by placeOrder — wait for it to settle.
    await waitFor(() => expect(useStore.getState().cart).toEqual(emptyCart));
  });

  it('propagates a failure from any step in the chain', async () => {
    (ordersApi.create as jest.Mock).mockRejectedValue(new Error('Insufficient stock.'));

    await expect(useStore.getState().placeOrder('addr-1', 'STANDARD')).rejects.toThrow('Insufficient stock.');
    expect(paymentsApi.create).not.toHaveBeenCalled();
  });
});

describe('finalizeOrder', () => {
  it('confirms the payment with the given payload, then refetches the order and cart', async () => {
    const confirmedOrder = { id: 'ord-1', status: 'CONFIRMED', total: 500 };
    (paymentsApi.confirm as jest.Mock).mockResolvedValue({ status: 'SUCCEEDED' });
    (ordersApi.get as jest.Mock).mockResolvedValue(confirmedOrder);
    (cartApi.getCart as jest.Mock).mockResolvedValue(emptyCart);

    const result = await useStore
      .getState()
      .finalizeOrder('ord-1', 'pay-1', { razorpayPaymentId: 'rzp-pay-1', razorpaySignature: 'sig-1' });

    expect(paymentsApi.confirm).toHaveBeenCalledWith('pay-1', {
      razorpayPaymentId: 'rzp-pay-1',
      razorpaySignature: 'sig-1',
    });
    expect(ordersApi.get).toHaveBeenCalledWith('ord-1');
    expect(result).toEqual(confirmedOrder);

    await waitFor(() => expect(useStore.getState().cart).toEqual(emptyCart));
  });

  it('throws the real failure reason when the provider reports the payment did not succeed', async () => {
    (paymentsApi.confirm as jest.Mock).mockResolvedValue({
      status: 'FAILED',
      failureReason: 'Razorpay payment signature verification failed.',
    });

    await expect(useStore.getState().finalizeOrder('ord-1', 'pay-1', {})).rejects.toThrow(
      'Razorpay payment signature verification failed.',
    );
    expect(ordersApi.get).not.toHaveBeenCalled();
  });
});

describe('sendShopAIMessage', () => {
  it('sends no conversationId on the first message, then reuses the returned id on the next', async () => {
    (shopaiApi.sendMessage as jest.Mock)
      .mockResolvedValueOnce({
        conversationId: 'conv-1',
        message: { role: 'assistant', content: 'reply 1' },
        toolActivity: [],
      })
      .mockResolvedValueOnce({
        conversationId: 'conv-1',
        message: { role: 'assistant', content: 'reply 2' },
        toolActivity: [],
      });

    const first = await useStore.getState().sendShopAIMessage('hello');
    expect(first).toEqual({ role: 'assistant', content: 'reply 1' });
    expect(shopaiApi.sendMessage).toHaveBeenNthCalledWith(1, { message: 'hello', conversationId: undefined });
    expect(useStore.getState().shopaiConversationId).toBe('conv-1');

    await useStore.getState().sendShopAIMessage('again');
    expect(shopaiApi.sendMessage).toHaveBeenNthCalledWith(2, { message: 'again', conversationId: 'conv-1' });
    // Neither call ever carries an anonymousId field — mobile has no guest path to give one to.
    expect(shopaiApi.sendMessage).not.toHaveBeenCalledWith(expect.objectContaining({ anonymousId: expect.anything() }));
  });

  it('recovers from a stale conversation id by retrying as a fresh conversation', async () => {
    useStore.setState({ shopaiConversationId: 'stale-conv' });
    (shopaiApi.sendMessage as jest.Mock)
      .mockRejectedValueOnce(
        new ApiError(404, {
          error: { code: 'CONVERSATION_NOT_FOUND', message: 'Conversation not found.', requestId: 'r1', details: {} },
        }),
      )
      .mockResolvedValueOnce({
        conversationId: 'conv-2',
        message: { role: 'assistant', content: 'fresh reply' },
        toolActivity: [],
      });

    const reply = await useStore.getState().sendShopAIMessage('hi again');

    expect(reply).toEqual({ role: 'assistant', content: 'fresh reply' });
    expect(shopaiApi.sendMessage).toHaveBeenNthCalledWith(1, { message: 'hi again', conversationId: 'stale-conv' });
    expect(shopaiApi.sendMessage).toHaveBeenNthCalledWith(2, { message: 'hi again', conversationId: undefined });
    expect(useStore.getState().shopaiConversationId).toBe('conv-2');
  });

  it('propagates a non-CONVERSATION_NOT_FOUND error without retrying', async () => {
    (shopaiApi.sendMessage as jest.Mock).mockRejectedValueOnce(new Error('Rate limit exceeded.'));

    await expect(useStore.getState().sendShopAIMessage('hello')).rejects.toThrow('Rate limit exceeded.');
    expect(shopaiApi.sendMessage).toHaveBeenCalledTimes(1);
  });
});
