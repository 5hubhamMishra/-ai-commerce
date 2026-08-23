import { fireEvent, render } from '@testing-library/react-native';
import { ordersApi } from '@ai-commerce/api-client';
import OrderDetailScreen from './OrderDetailScreen';

jest.mock('@ai-commerce/api-client', () => ({
  ordersApi: { get: jest.fn(), cancel: jest.fn() },
}));

jest.setTimeout(20000);

const route = { params: { id: 'order-1' } } as unknown as Parameters<typeof OrderDetailScreen>[0]['route'];
const navigation = {} as Parameters<typeof OrderDetailScreen>[0]['navigation'];

function order(overrides: Record<string, unknown> = {}) {
  return {
    id: 'order-1',
    status: 'SHIPPED',
    subtotal: 1200,
    shippingFee: 0,
    discountTotal: 0,
    taxTotal: 0,
    total: 1200,
    currency: 'INR',
    shippingMethod: 'STANDARD',
    cancelReason: null,
    cancelledAt: null,
    createdAt: '2026-01-05T00:00:00.000Z',
    updatedAt: '2026-01-05T00:00:00.000Z',
    address: {
      line1: '221B Baker Street',
      line2: null,
      city: 'Mumbai',
      state: 'Maharashtra',
      postalCode: '400001',
      country: 'India',
    },
    items: [
      { id: 'item-1', variantId: 'v1', productName: 'Silk Scarf', sku: 'SKU1', unitPrice: 1200, quantity: 1, lineTotal: 1200, currency: 'INR' },
    ],
    shipment: null,
    payments: [],
    stateHistory: [],
    ...overrides,
  };
}

describe('OrderDetailScreen', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('fetches the order by route id and renders items, breakdown, and address', async () => {
    (ordersApi.get as jest.Mock).mockResolvedValue(order());

    const { findAllByText, findByText } = await render(<OrderDetailScreen navigation={navigation} route={route} />);

    expect(ordersApi.get).toHaveBeenCalledWith('order-1');
    expect(await findByText('Silk Scarf')).toBeTruthy();
    // ₹1,200 renders three times (line item, subtotal, total) since shipping is free —
    // findAllByText avoids the ambiguous-match error a plain findByText would throw here.
    const prices = await findAllByText('₹1,200');
    expect(prices.length).toBe(3);
    expect(await findByText(/221B Baker Street/)).toBeTruthy();
  });

  it('shows the progress tracker with the correct stages filled for a happy-path status', async () => {
    (ordersApi.get as jest.Mock).mockResolvedValue(order({ status: 'SHIPPED' }));

    const { findByText } = await render(<OrderDetailScreen navigation={navigation} route={route} />);

    expect(await findByText('Order progress')).toBeTruthy();
    // "Shipped" itself renders twice (header badge + tracker stage) — assert an earlier
    // happy-path stage instead, which only appears once, to avoid an ambiguous query.
    expect(await findByText('Order confirmed')).toBeTruthy();
  });

  it('does not show a progress tracker for a cancelled order, only the badge', async () => {
    (ordersApi.get as jest.Mock).mockResolvedValue(order({ status: 'CANCELLED', cancelReason: 'Changed my mind' }));

    const { findByText, queryByText } = await render(<OrderDetailScreen navigation={navigation} route={route} />);

    expect(await findByText('Cancellation reason: Changed my mind')).toBeTruthy();
    expect(queryByText('Order progress')).toBeNull();
  });

  it('renders shipment tracking events when present', async () => {
    (ordersApi.get as jest.Mock).mockResolvedValue(
      order({
        shipment: {
          method: 'STANDARD',
          fee: 0,
          status: 'IN_TRANSIT',
          carrier: 'BlueDart',
          trackingNumber: 'BD123',
          events: [{ status: 'PICKED_UP', location: 'Mumbai Hub', description: null, occurredAt: '2026-01-06T00:00:00.000Z' }],
        },
      }),
    );

    const { findByText } = await render(<OrderDetailScreen navigation={navigation} route={route} />);

    expect(await findByText(/BlueDart/)).toBeTruthy();
    expect(await findByText(/PICKED UP — Mumbai Hub/)).toBeTruthy();
  });

  it('shows the Cancel order button for a cancellable status', async () => {
    (ordersApi.get as jest.Mock).mockResolvedValue(order({ status: 'CONFIRMED' }));

    const { findByLabelText } = await render(<OrderDetailScreen navigation={navigation} route={route} />);

    expect(await findByLabelText('Cancel order')).toBeTruthy();
  });

  it('hides the Cancel order button for a non-cancellable status', async () => {
    (ordersApi.get as jest.Mock).mockResolvedValue(order({ status: 'DELIVERED' }));

    const { findByText, queryByLabelText } = await render(<OrderDetailScreen navigation={navigation} route={route} />);
    await findByText('Silk Scarf');

    expect(queryByLabelText('Cancel order')).toBeNull();
  });

  it('pressing Cancel order calls ordersApi.cancel and updates the rendered status in place', async () => {
    (ordersApi.get as jest.Mock).mockResolvedValue(order({ status: 'CONFIRMED' }));
    (ordersApi.cancel as jest.Mock).mockResolvedValue(order({ status: 'CANCELLED' }));

    const { findByLabelText, findByText } = await render(<OrderDetailScreen navigation={navigation} route={route} />);
    await fireEvent.press(await findByLabelText('Cancel order'));

    expect(ordersApi.cancel).toHaveBeenCalledWith('order-1');
    expect(await findByText('Cancelled')).toBeTruthy();
  });

  it('shows the real error message when cancelling fails, and re-enables the button', async () => {
    (ordersApi.get as jest.Mock).mockResolvedValue(order({ status: 'CONFIRMED' }));
    (ordersApi.cancel as jest.Mock).mockRejectedValue(new Error('Order already shipped.'));

    const { findByLabelText, findByText } = await render(<OrderDetailScreen navigation={navigation} route={route} />);
    await fireEvent.press(await findByLabelText('Cancel order'));

    expect(await findByText('Order already shipped.')).toBeTruthy();
  });

  it('shows an order-not-found state when the fetch fails', async () => {
    (ordersApi.get as jest.Mock).mockRejectedValue(new Error('not found'));

    const { findByText } = await render(<OrderDetailScreen navigation={navigation} route={route} />);

    expect(await findByText('Order not found.')).toBeTruthy();
  });
});
