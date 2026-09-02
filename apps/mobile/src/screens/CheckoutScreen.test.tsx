import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { shippingApi } from '@ai-commerce/api-client';
import CheckoutScreen from './CheckoutScreen';
import { useStore } from '../store/useStore';

jest.mock('@ai-commerce/api-client', () => ({
  shippingApi: { quote: jest.fn() },
}));
jest.mock('../store/useStore', () => ({
  useStore: jest.fn(),
}));

jest.setTimeout(20000);

const fetchAddresses = jest.fn();
const createAddress = jest.fn();
const placeOrder = jest.fn();
const navigate = jest.fn();
const replace = jest.fn();
const navigation = { navigate, replace } as unknown as Parameters<typeof CheckoutScreen>[0]['navigation'];

const cart = {
  id: 'cart-1',
  items: [
    {
      id: 'item-1',
      variantId: 'v1',
      productId: 'p1',
      productName: 'Silk Scarf',
      productSlug: 'silk-scarf',
      sku: 'SKU1',
      imageUrl: null,
      unitPrice: 1200,
      currency: 'INR',
      quantity: 1,
      lineTotal: 1200,
      availableQuantity: 5,
      isAvailable: true,
      insufficientStock: false,
      attributes: [],
    },
  ],
  itemCount: 1,
  subtotal: 1200,
  currency: 'INR',
  hasUnavailableItems: false,
};

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

const quote = { method: 'STANDARD', label: 'Standard', fee: 0, currency: 'INR', estimatedDaysMin: 3, estimatedDaysMax: 5 };

function mockStore(overrides: { addresses?: typeof address[] | null; addressesStatus?: string } = {}) {
  (useStore as unknown as jest.Mock).mockImplementation((selector: (state: unknown) => unknown) =>
    selector({
      cart,
      addresses: overrides.addresses ?? null,
      addressesStatus: overrides.addressesStatus ?? 'idle',
      fetchAddresses,
      createAddress,
      placeOrder,
    }),
  );
}

describe('CheckoutScreen', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('shows the empty-cart guard when the cart has no items', async () => {
    (useStore as unknown as jest.Mock).mockImplementation((selector: (state: unknown) => unknown) =>
      selector({ cart: { ...cart, items: [] }, addresses: [], addressesStatus: 'idle', fetchAddresses, createAddress, placeOrder }),
    );

    const { findByText } = await render(<CheckoutScreen navigation={navigation} route={{} as never} />);

    expect(await findByText('Your cart is empty.')).toBeTruthy();
  });

  it('fetches addresses on mount', async () => {
    mockStore({ addresses: [address] });
    (shippingApi.quote as jest.Mock).mockResolvedValue([quote]);

    await render(<CheckoutScreen navigation={navigation} route={{} as never} />);

    expect(fetchAddresses).toHaveBeenCalled();
  });

  it('auto-shows the add-address form when there are no saved addresses', async () => {
    mockStore({ addresses: [] });

    const { findByLabelText } = await render(<CheckoutScreen navigation={navigation} route={{} as never} />);

    expect(await findByLabelText('Save address')).toBeTruthy();
  });

  it('loads a shipping quote for the default address and shows the total', async () => {
    mockStore({ addresses: [address] });
    (shippingApi.quote as jest.Mock).mockResolvedValue([quote]);

    const { findByText } = await render(<CheckoutScreen navigation={navigation} route={{} as never} />);

    await waitFor(() => expect(shippingApi.quote).toHaveBeenCalledWith('addr-1'));
    expect(await findByText('Place order — ₹1,200')).toBeTruthy();
  });

  it('saving a new address calls createAddress with trimmed fields and isDefault true for the first address', async () => {
    mockStore({ addresses: [] });
    createAddress.mockResolvedValue({ ...address, id: 'addr-2' });

    const { getByLabelText } = await render(<CheckoutScreen navigation={navigation} route={{} as never} />);
    await fireEvent.changeText(getByLabelText('House no, building, street'), '  42 Baker Street  ');
    await fireEvent.changeText(getByLabelText('City'), '  Mumbai  ');
    await fireEvent.changeText(getByLabelText('State'), '  Maharashtra  ');
    await fireEvent.changeText(getByLabelText('PIN code'), '  400001  ');
    await fireEvent.press(getByLabelText('Save address'));

    await waitFor(() =>
      expect(createAddress).toHaveBeenCalledWith(
        expect.objectContaining({
          line1: '42 Baker Street',
          city: 'Mumbai',
          state: 'Maharashtra',
          postalCode: '400001',
          isDefault: true,
        }),
      ),
    );
  });

  it('placing an order calls placeOrder and replaces navigation with the new order detail', async () => {
    mockStore({ addresses: [address] });
    (shippingApi.quote as jest.Mock).mockResolvedValue([quote]);
    placeOrder.mockResolvedValue({ id: 'ord-1' });

    const { findByLabelText } = await render(<CheckoutScreen navigation={navigation} route={{} as never} />);
    await waitFor(async () => expect(await findByLabelText('Place order')).toBeTruthy());
    await fireEvent.press(await findByLabelText('Place order'));

    await waitFor(() => expect(placeOrder).toHaveBeenCalledWith('addr-1', 'STANDARD', expect.any(String)));
    expect(replace).toHaveBeenCalledWith('OrderDetail', { id: 'ord-1' });
  });

  it('shows the real error message when placing an order fails, and re-enables the button', async () => {
    mockStore({ addresses: [address] });
    (shippingApi.quote as jest.Mock).mockResolvedValue([quote]);
    placeOrder.mockRejectedValue(new Error('Insufficient stock.'));

    const { findByLabelText, findByText } = await render(<CheckoutScreen navigation={navigation} route={{} as never} />);
    await waitFor(async () => expect(await findByLabelText('Place order')).toBeTruthy());
    await fireEvent.press(await findByLabelText('Place order'));

    expect(await findByText('Insufficient stock.')).toBeTruthy();
    expect(replace).not.toHaveBeenCalled();
  });
});
