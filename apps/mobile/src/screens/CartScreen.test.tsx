import { fireEvent, render } from '@testing-library/react-native';
import CartScreen from './CartScreen';
import { useStore } from '../store/useStore';

jest.mock('../store/useStore', () => ({
  useStore: jest.fn(),
}));

jest.setTimeout(20000);

const fetchCart = jest.fn();
const updateCartItem = jest.fn();
const removeCartItem = jest.fn();
const navigate = jest.fn();
const navigation = { navigate } as unknown as Parameters<typeof CartScreen>[0]['navigation'];

const cartItem = {
  id: 'item-1',
  variantId: 'v1',
  productId: 'p1',
  productName: 'Silk Scarf',
  productSlug: 'silk-scarf',
  sku: 'SKU1',
  imageUrl: null,
  unitPrice: 1200,
  currency: 'INR',
  quantity: 2,
  lineTotal: 2400,
  availableQuantity: 5,
  isAvailable: true,
  insufficientStock: false,
  attributes: [],
};

function mockStore(cart: { items: typeof cartItem[]; itemCount: number; subtotal: number } | null, cartStatus = 'idle') {
  (useStore as unknown as jest.Mock).mockImplementation((selector: (state: unknown) => unknown) =>
    selector({ cart, cartStatus, fetchCart, updateCartItem, removeCartItem }),
  );
}

describe('CartScreen', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('fetches the cart on mount and renders its items', async () => {
    mockStore({ items: [cartItem], itemCount: 2, subtotal: 2400 });

    const { findByText } = await render(<CartScreen navigation={navigation} route={{} as never} />);

    expect(fetchCart).toHaveBeenCalled();
    expect(await findByText('Silk Scarf')).toBeTruthy();
    expect(await findByText('₹2,400')).toBeTruthy();
  });

  it('shows an empty state when the cart has no items', async () => {
    mockStore({ items: [], itemCount: 0, subtotal: 0 });

    const { findByText } = await render(<CartScreen navigation={navigation} route={{} as never} />);

    expect(await findByText('Your cart is empty.')).toBeTruthy();
  });

  it('increasing quantity calls updateCartItem with quantity + 1', async () => {
    mockStore({ items: [cartItem], itemCount: 2, subtotal: 2400 });
    updateCartItem.mockResolvedValue(undefined);

    const { findByLabelText } = await render(<CartScreen navigation={navigation} route={{} as never} />);
    await fireEvent.press(await findByLabelText('Increase quantity of Silk Scarf'));

    expect(updateCartItem).toHaveBeenCalledWith('item-1', 3);
  });

  it('removing an item calls removeCartItem', async () => {
    mockStore({ items: [cartItem], itemCount: 2, subtotal: 2400 });
    removeCartItem.mockResolvedValue(undefined);

    const { findByLabelText } = await render(<CartScreen navigation={navigation} route={{} as never} />);
    await fireEvent.press(await findByLabelText('Remove Silk Scarf from cart'));

    expect(removeCartItem).toHaveBeenCalledWith('item-1');
  });

  it('flags a line with insufficient stock', async () => {
    mockStore({ items: [{ ...cartItem, insufficientStock: true, availableQuantity: 1 }], itemCount: 2, subtotal: 2400 });

    const { findByText } = await render(<CartScreen navigation={navigation} route={{} as never} />);

    expect(await findByText('Only 1 left in stock')).toBeTruthy();
  });

  it('navigates to the product when a cart row is pressed', async () => {
    mockStore({ items: [cartItem], itemCount: 2, subtotal: 2400 });

    const { findByLabelText } = await render(<CartScreen navigation={navigation} route={{} as never} />);
    await fireEvent.press(await findByLabelText('Silk Scarf'));

    expect(navigate).toHaveBeenCalledWith('ProductDetail', { slug: 'silk-scarf' });
  });

  it('navigates to Checkout when the checkout button is pressed', async () => {
    mockStore({ items: [cartItem], itemCount: 2, subtotal: 2400 });

    const { findByLabelText } = await render(<CartScreen navigation={navigation} route={{} as never} />);
    await fireEvent.press(await findByLabelText('Proceed to checkout'));

    expect(navigate).toHaveBeenCalledWith('Checkout');
  });
});
