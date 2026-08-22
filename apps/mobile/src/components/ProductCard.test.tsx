import { fireEvent, render } from '@testing-library/react-native';
import type { ProductListItem } from '@ai-commerce/types';
import ProductCard from './ProductCard';
import { useStore } from '../store/useStore';

jest.mock('../store/useStore', () => ({
  useStore: jest.fn(),
}));

const toggleWishlistItem = jest.fn();

function mockStore(wishlistedProductIds: string[]) {
  (useStore as unknown as jest.Mock).mockImplementation((selector: (state: unknown) => unknown) =>
    selector({
      wishlist: { items: wishlistedProductIds.map((productId) => ({ productId })) },
      toggleWishlistItem,
    }),
  );
}

const product: ProductListItem = {
  id: 'p1',
  slug: 'silk-scarf',
  name: 'Silk Scarf',
  status: 'ACTIVE',
  isFeatured: false,
  category: { id: 'c1', name: 'Accessories', slug: 'accessories' },
  brand: { id: 'b1', name: 'Veloura', slug: 'veloura' },
  seller: null,
  currency: 'INR',
  minPrice: 1200,
  maxPrice: 1200,
  primaryImageUrl: '/products/items/scarf.jpg',
  inStock: true,
};

describe('ProductCard', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('renders the brand, name, and price, and calls onPress when tapped', async () => {
    mockStore([]);
    const onPress = jest.fn();

    const { getByText, getByLabelText } = await render(<ProductCard product={product} onPress={onPress} />);

    expect(getByText('Veloura')).toBeTruthy();
    expect(getByText('Silk Scarf')).toBeTruthy();
    expect(getByText('₹1,200')).toBeTruthy();

    await fireEvent.press(getByLabelText('Silk Scarf'));
    expect(onPress).toHaveBeenCalled();
  });

  it('shows a price range when min and max differ', async () => {
    mockStore([]);
    const { getByText } = await render(
      <ProductCard product={{ ...product, minPrice: 1000, maxPrice: 1500 }} onPress={jest.fn()} />,
    );
    expect(getByText('From ₹1,000')).toBeTruthy();
  });

  it('shows an out-of-stock badge when the product has no stock', async () => {
    mockStore([]);
    const { getByText } = await render(<ProductCard product={{ ...product, inStock: false }} onPress={jest.fn()} />);
    expect(getByText('Out of stock')).toBeTruthy();
  });

  it('reflects wishlist state and toggles it on heart press without triggering onPress', async () => {
    mockStore(['p1']);
    const onPress = jest.fn();

    const { getByLabelText } = await render(<ProductCard product={product} onPress={onPress} />);
    await fireEvent.press(getByLabelText('Remove from wishlist'));

    expect(toggleWishlistItem).toHaveBeenCalledWith('p1');
    expect(onPress).not.toHaveBeenCalled();
  });
});
