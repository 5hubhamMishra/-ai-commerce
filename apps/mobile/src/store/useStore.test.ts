import { waitFor } from '@testing-library/react-native';
import type { PublicUser } from '@ai-commerce/types';
import { authApi, cartApi, wishlistApi } from '@ai-commerce/api-client';
import { session } from '../api/session';
import { mobileRefresh, setAccessToken } from '../api/apiClient';
import { useStore } from './useStore';

jest.mock('@ai-commerce/api-client', () => ({
  authApi: { login: jest.fn(), register: jest.fn(), logout: jest.fn(), me: jest.fn() },
  cartApi: { getCart: jest.fn(), addItem: jest.fn(), updateItem: jest.fn(), removeItem: jest.fn() },
  wishlistApi: { list: jest.fn(), add: jest.fn(), remove: jest.fn() },
}));
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
  useStore.setState({ ...initialState, user: null, authStatus: 'idle', cart: null, wishlist: null }, true);
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
    useStore.setState({ user: publicUser, authStatus: 'authenticated', cart: emptyCart, wishlist: emptyWishlist });
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
