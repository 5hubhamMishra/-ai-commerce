import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { ordersApi } from '@ai-commerce/api-client';
import OrderListScreen from './OrderListScreen';

jest.mock('@ai-commerce/api-client', () => ({
  ordersApi: { list: jest.fn() },
}));

jest.setTimeout(20000);

const navigate = jest.fn();
const navigation = { navigate } as unknown as Parameters<typeof OrderListScreen>[0]['navigation'];

const order = {
  id: 'order-abcdef12',
  status: 'DELIVERED' as const,
  total: 1200,
  currency: 'INR',
  itemCount: 2,
  createdAt: '2026-01-05T00:00:00.000Z',
};

describe('OrderListScreen', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('fetches page 1 on mount and renders order rows', async () => {
    (ordersApi.list as jest.Mock).mockResolvedValue({ items: [order], total: 1, page: 1, pageSize: 20 });

    const { findByText } = await render(<OrderListScreen navigation={navigation} route={{} as never} />);

    expect(ordersApi.list).toHaveBeenCalledWith({ page: 1, pageSize: 20 });
    expect(await findByText('₹1,200')).toBeTruthy();
    expect(await findByText('Delivered')).toBeTruthy();
    expect(await findByText('2 items')).toBeTruthy();
  });

  it('shows an empty state when there are no orders', async () => {
    (ordersApi.list as jest.Mock).mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 20 });

    const { findByText } = await render(<OrderListScreen navigation={navigation} route={{} as never} />);

    expect(await findByText("You haven't placed any orders yet.")).toBeTruthy();
  });

  it('shows an error state when the request fails', async () => {
    (ordersApi.list as jest.Mock).mockRejectedValue(new Error('Could not load your orders.'));

    const { findByText } = await render(<OrderListScreen navigation={navigation} route={{} as never} />);

    expect(await findByText('Could not load your orders.')).toBeTruthy();
  });

  it('navigates to the order detail when a row is pressed', async () => {
    (ordersApi.list as jest.Mock).mockResolvedValue({ items: [order], total: 1, page: 1, pageSize: 20 });

    const { findByLabelText } = await render(<OrderListScreen navigation={navigation} route={{} as never} />);
    await fireEvent.press(await findByLabelText('Order order-ab'));

    expect(navigate).toHaveBeenCalledWith('OrderDetail', { id: 'order-abcdef12' });
  });

  it('fetches and appends the next page on end reached', async () => {
    const page1 = { items: [order], total: 2, page: 1, pageSize: 20 };
    const page2 = { items: [{ ...order, id: 'order-2' }], total: 2, page: 2, pageSize: 20 };
    (ordersApi.list as jest.Mock).mockResolvedValueOnce(page1).mockResolvedValueOnce(page2);

    const { findByText, getByTestId } = await render(<OrderListScreen navigation={navigation} route={{} as never} />);
    await findByText('₹1,200');

    await fireEvent(getByTestId('order-list'), 'endReached');

    await waitFor(() => expect(ordersApi.list).toHaveBeenCalledWith({ page: 2, pageSize: 20 }));
  });
});
