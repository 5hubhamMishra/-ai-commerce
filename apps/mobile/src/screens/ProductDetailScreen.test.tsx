import { fireEvent, render } from '@testing-library/react-native';
import { catalogApi } from '@ai-commerce/api-client';
import ProductDetailScreen from './ProductDetailScreen';
import { useStore } from '../store/useStore';

jest.mock('@ai-commerce/api-client', () => ({
  catalogApi: { getProductBySlug: jest.fn() },
}));
jest.mock('../store/useStore', () => ({
  useStore: jest.fn(),
}));

jest.setTimeout(20000);

const addCartItem = jest.fn();
const toggleWishlistItem = jest.fn();

function mockStore(wishlistedProductIds: string[] = []) {
  (useStore as unknown as jest.Mock).mockImplementation((selector: (state: unknown) => unknown) =>
    selector({
      addCartItem,
      toggleWishlistItem,
      wishlist: { items: wishlistedProductIds.map((productId) => ({ productId })) },
    }),
  );
}

const route = { params: { slug: 'silk-scarf' } } as unknown as Parameters<typeof ProductDetailScreen>[0]['route'];
const navigation = {} as Parameters<typeof ProductDetailScreen>[0]['navigation'];

const product = {
  id: 'p1',
  slug: 'silk-scarf',
  name: 'Silk Scarf',
  status: 'ACTIVE' as const,
  isFeatured: false,
  category: { id: 'c1', name: 'Accessories', slug: 'accessories' },
  brand: { id: 'b1', name: 'Veloura', slug: 'veloura' },
  seller: null,
  currency: 'INR',
  minPrice: 1200,
  maxPrice: 1200,
  primaryImageUrl: null,
  inStock: true,
  description: 'A beautiful silk scarf.',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  images: [],
  specifications: [{ id: 's1', group: 'Material', key: 'Fabric', value: 'Silk', sortOrder: 0 }],
  tags: [],
  variants: [
    {
      id: 'v1',
      sku: 'SKU1',
      price: 1200,
      compareAtPrice: null,
      currency: 'INR',
      weightGrams: null,
      isDefault: true,
      isActive: true,
      availableQuantity: 5,
      attributes: [],
    },
  ],
};

describe('ProductDetailScreen', () => {
  beforeEach(() => {
    mockStore();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('loads the product by slug and renders its name, price, and specifications', async () => {
    (catalogApi.getProductBySlug as jest.Mock).mockResolvedValue(product);

    const { findByText } = await render(<ProductDetailScreen route={route} navigation={navigation} />);

    expect(catalogApi.getProductBySlug).toHaveBeenCalledWith('silk-scarf');
    expect(await findByText('Silk Scarf')).toBeTruthy();
    expect(await findByText('₹1,200')).toBeTruthy();
    expect(await findByText('Fabric')).toBeTruthy();
    expect(await findByText('Silk')).toBeTruthy();
  });

  it('adds the resolved variant to the cart at the selected quantity', async () => {
    (catalogApi.getProductBySlug as jest.Mock).mockResolvedValue(product);
    addCartItem.mockResolvedValue(undefined);

    const { findByLabelText, getByLabelText } = await render(
      <ProductDetailScreen route={route} navigation={navigation} />,
    );
    await fireEvent.press(await findByLabelText('Increase quantity'));
    await fireEvent.press(getByLabelText('Add to cart'));

    expect(addCartItem).toHaveBeenCalledWith('v1', 2);
  });

  it('shows an error message when the product fails to load', async () => {
    (catalogApi.getProductBySlug as jest.Mock).mockRejectedValue(new Error('Product not found.'));

    const { findByText } = await render(<ProductDetailScreen route={route} navigation={navigation} />);

    expect(await findByText('Product not found.')).toBeTruthy();
  });

  it('toggles the wishlist state for this product', async () => {
    (catalogApi.getProductBySlug as jest.Mock).mockResolvedValue(product);
    toggleWishlistItem.mockResolvedValue(undefined);

    const { findByLabelText } = await render(<ProductDetailScreen route={route} navigation={navigation} />);
    await fireEvent.press(await findByLabelText('Add to wishlist'));

    expect(toggleWishlistItem).toHaveBeenCalledWith('p1');
  });

  it('disables Add to cart and shows Unavailable when the resolved variant has no stock', async () => {
    (catalogApi.getProductBySlug as jest.Mock).mockResolvedValue({
      ...product,
      variants: [{ ...product.variants[0], availableQuantity: 0 }],
    });

    const { findByText } = await render(<ProductDetailScreen route={route} navigation={navigation} />);

    expect(await findByText('Unavailable')).toBeTruthy();
    expect(await findByText('Out of stock')).toBeTruthy();
  });
});
