import { fireEvent, render } from '@testing-library/react-native';
import type { ProductListItem } from '@ai-commerce/types';
import RecommendationRail from './RecommendationRail';
import { useStore } from '../store/useStore';

jest.mock('../store/useStore', () => ({
  useStore: jest.fn(),
}));

function mockStore() {
  (useStore as unknown as jest.Mock).mockImplementation((selector: (state: unknown) => unknown) =>
    selector({ wishlist: null, toggleWishlistItem: jest.fn() }),
  );
}

function makeProduct(id: string, name: string): ProductListItem {
  return {
    id,
    slug: id,
    name,
    status: 'ACTIVE',
    isFeatured: false,
    category: { id: 'c1', name: 'Accessories', slug: 'accessories' },
    brand: null,
    seller: null,
    currency: 'INR',
    minPrice: 100,
    maxPrice: 100,
    primaryImageUrl: null,
    inStock: true,
  };
}

describe('RecommendationRail', () => {
  beforeEach(() => {
    mockStore();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('renders the title and every product', async () => {
    const products = [makeProduct('p1', 'Silk Scarf'), makeProduct('p2', 'Wool Hat')];

    const { getByText } = await render(
      <RecommendationRail title="Recommended for you" products={products} onPressProduct={jest.fn()} />,
    );

    expect(getByText('Recommended for you')).toBeTruthy();
    expect(getByText('Silk Scarf')).toBeTruthy();
    expect(getByText('Wool Hat')).toBeTruthy();
  });

  it('calls onPressProduct with the pressed product', async () => {
    const products = [makeProduct('p1', 'Silk Scarf')];
    const onPressProduct = jest.fn();

    const { getByLabelText } = await render(
      <RecommendationRail title="Recommended for you" products={products} onPressProduct={onPressProduct} />,
    );
    await fireEvent.press(getByLabelText('Silk Scarf'));

    expect(onPressProduct).toHaveBeenCalledWith(products[0]);
  });

  it('renders nothing when there are no products', async () => {
    const { queryByText, toJSON } = await render(
      <RecommendationRail title="Recommended for you" products={[]} onPressProduct={jest.fn()} />,
    );

    expect(queryByText('Recommended for you')).toBeNull();
    expect(toJSON()).toBeNull();
  });
});
