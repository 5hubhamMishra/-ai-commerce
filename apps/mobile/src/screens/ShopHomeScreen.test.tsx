import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { catalogApi } from '@ai-commerce/api-client';
import ShopHomeScreen from './ShopHomeScreen';
import { useStore } from '../store/useStore';
import { useRecommendations } from '../lib/useRecommendations';

// The first test in this file pays the one-time cost of compiling/mounting the FlatList +
// navigation stack; give it headroom above Jest's 5s default rather than risk flakiness on
// slower CI runners.
jest.setTimeout(20000);

jest.mock('@ai-commerce/api-client', () => ({
  catalogApi: { listCategories: jest.fn(), listProducts: jest.fn() },
}));
jest.mock('../store/useStore', () => ({
  useStore: jest.fn(),
}));
jest.mock('../lib/useRecommendations', () => ({
  useRecommendations: jest.fn(),
}));

const navigate = jest.fn();
const navigation = { navigate } as unknown as Parameters<typeof ShopHomeScreen>[0]['navigation'];

const product = {
  id: 'p1',
  slug: 'silk-scarf',
  name: 'Silk Scarf',
  status: 'ACTIVE' as const,
  isFeatured: false,
  category: { id: 'c1', name: 'Accessories', slug: 'accessories' },
  brand: null,
  seller: null,
  currency: 'INR',
  minPrice: 1200,
  maxPrice: 1200,
  primaryImageUrl: null,
  inStock: true,
};

const recommendedProduct = {
  ...product,
  id: 'p2',
  slug: 'wool-hat',
  name: 'Wool Hat',
};

describe('ShopHomeScreen', () => {
  beforeEach(() => {
    (useStore as unknown as jest.Mock).mockImplementation((selector: (state: unknown) => unknown) =>
      selector({ wishlist: null, toggleWishlistItem: jest.fn() }),
    );
    (catalogApi.listCategories as jest.Mock).mockResolvedValue([]);
    (useRecommendations as jest.Mock).mockReturnValue(null);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('loads and renders the first page of products', async () => {
    (catalogApi.listProducts as jest.Mock).mockResolvedValue({ items: [product], total: 1, page: 1, pageSize: 20 });

    const { findByText } = await render(<ShopHomeScreen navigation={navigation} route={{} as never} />);

    expect(await findByText('Silk Scarf')).toBeTruthy();
    expect(catalogApi.listProducts).toHaveBeenCalledWith(
      expect.objectContaining({ page: 1, pageSize: 20, sort: 'newest' }),
    );
  });

  it('navigates to product detail when a product card is pressed', async () => {
    (catalogApi.listProducts as jest.Mock).mockResolvedValue({ items: [product], total: 1, page: 1, pageSize: 20 });

    const { findByText } = await render(<ShopHomeScreen navigation={navigation} route={{} as never} />);
    await fireEvent.press(await findByText('Silk Scarf'));

    expect(navigate).toHaveBeenCalledWith('ProductDetail', { slug: 'silk-scarf' });
  });

  it('shows an error state when the product list fails to load', async () => {
    (catalogApi.listProducts as jest.Mock).mockRejectedValue(new Error('Could not reach the catalog.'));

    const { findByText } = await render(<ShopHomeScreen navigation={navigation} route={{} as never} />);

    expect(await findByText('Could not reach the catalog.')).toBeTruthy();
  });

  it('shows an empty state when no products match', async () => {
    (catalogApi.listProducts as jest.Mock).mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 20 });

    const { findByText } = await render(<ShopHomeScreen navigation={navigation} route={{} as never} />);

    expect(await findByText('No products found.')).toBeTruthy();
  });

  it('re-queries with the search term on submit', async () => {
    (catalogApi.listProducts as jest.Mock).mockResolvedValue({ items: [product], total: 1, page: 1, pageSize: 20 });

    const { getByLabelText } = await render(<ShopHomeScreen navigation={navigation} route={{} as never} />);
    await fireEvent.changeText(getByLabelText('Search products'), 'scarf');
    await fireEvent(getByLabelText('Search products'), 'submitEditing');

    await waitFor(() =>
      expect(catalogApi.listProducts).toHaveBeenLastCalledWith(expect.objectContaining({ search: 'scarf', page: 1 })),
    );
  });

  it('renders a "Recommended for you" rail on the default browse view', async () => {
    (catalogApi.listProducts as jest.Mock).mockResolvedValue({ items: [product], total: 1, page: 1, pageSize: 20 });
    (useRecommendations as jest.Mock).mockReturnValue([{ product: recommendedProduct, score: 0.8, reasons: [] }]);

    const { findByText } = await render(<ShopHomeScreen navigation={navigation} route={{} as never} />);

    expect(await findByText('Recommended for you')).toBeTruthy();
    expect(await findByText('Wool Hat')).toBeTruthy();
  });

  it('navigates to product detail when a recommended rail item is pressed', async () => {
    (catalogApi.listProducts as jest.Mock).mockResolvedValue({ items: [product], total: 1, page: 1, pageSize: 20 });
    (useRecommendations as jest.Mock).mockReturnValue([{ product: recommendedProduct, score: 0.8, reasons: [] }]);

    const { findByText } = await render(<ShopHomeScreen navigation={navigation} route={{} as never} />);
    await fireEvent.press(await findByText('Wool Hat'));

    expect(navigate).toHaveBeenCalledWith('ProductDetail', { slug: 'wool-hat' });
  });

  it('disables the recommendations hook (rail hidden) once a search filter is applied', async () => {
    (catalogApi.listProducts as jest.Mock).mockResolvedValue({ items: [product], total: 1, page: 1, pageSize: 20 });

    const { getByLabelText } = await render(<ShopHomeScreen navigation={navigation} route={{} as never} />);
    await fireEvent.changeText(getByLabelText('Search products'), 'scarf');
    await fireEvent(getByLabelText('Search products'), 'submitEditing');

    await waitFor(() =>
      expect(useRecommendations).toHaveBeenLastCalledWith('personalized', expect.objectContaining({ enabled: false })),
    );
  });
});
