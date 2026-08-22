import { fireEvent, render } from '@testing-library/react-native';
import WishlistScreen from './WishlistScreen';
import { useStore } from '../store/useStore';

jest.mock('../store/useStore', () => ({
  useStore: jest.fn(),
}));

jest.setTimeout(20000);

const fetchWishlist = jest.fn();
const toggleWishlistItem = jest.fn();
const navigate = jest.fn();
const navigation = { navigate } as unknown as Parameters<typeof WishlistScreen>[0]['navigation'];

const wishlistItem = {
  productId: 'p1',
  slug: 'silk-scarf',
  name: 'Silk Scarf',
  brand: 'Veloura',
  status: 'ACTIVE' as const,
  imageUrl: null,
  minPrice: 1200,
  maxPrice: 1200,
  isAvailable: true,
  addedAt: '2026-01-01T00:00:00.000Z',
};

function mockStore(wishlist: { items: typeof wishlistItem[] } | null, wishlistStatus = 'idle') {
  (useStore as unknown as jest.Mock).mockImplementation((selector: (state: unknown) => unknown) =>
    selector({ wishlist, wishlistStatus, fetchWishlist, toggleWishlistItem }),
  );
}

describe('WishlistScreen', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('fetches the wishlist on mount and renders its items', async () => {
    mockStore({ items: [wishlistItem] });

    const { findByText } = await render(<WishlistScreen navigation={navigation} route={{} as never} />);

    expect(fetchWishlist).toHaveBeenCalled();
    expect(await findByText('Silk Scarf')).toBeTruthy();
    expect(await findByText('₹1,200')).toBeTruthy();
  });

  it('shows an empty state when the wishlist has no items', async () => {
    mockStore({ items: [] });

    const { findByText } = await render(<WishlistScreen navigation={navigation} route={{} as never} />);

    expect(await findByText('Your wishlist is empty.')).toBeTruthy();
  });

  it('removing an item calls toggleWishlistItem', async () => {
    mockStore({ items: [wishlistItem] });
    toggleWishlistItem.mockResolvedValue(undefined);

    const { findByLabelText } = await render(<WishlistScreen navigation={navigation} route={{} as never} />);
    await fireEvent.press(await findByLabelText('Remove Silk Scarf from wishlist'));

    expect(toggleWishlistItem).toHaveBeenCalledWith('p1');
  });

  it('shows an unavailable flag for a product that is no longer purchasable', async () => {
    mockStore({ items: [{ ...wishlistItem, isAvailable: false }] });

    const { findByText } = await render(<WishlistScreen navigation={navigation} route={{} as never} />);

    expect(await findByText('Unavailable')).toBeTruthy();
  });

  it('navigates to the product when a wishlist row is pressed', async () => {
    mockStore({ items: [wishlistItem] });

    const { findByText } = await render(<WishlistScreen navigation={navigation} route={{} as never} />);
    await fireEvent.press(await findByText('Silk Scarf'));

    expect(navigate).toHaveBeenCalledWith('ProductDetail', { slug: 'silk-scarf' });
  });
});
