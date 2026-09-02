import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { notificationsApi } from '@ai-commerce/api-client';
import NotificationsScreen from './NotificationsScreen';

jest.mock('@ai-commerce/api-client', () => ({
  notificationsApi: {
    list: jest.fn(),
    markRead: jest.fn(),
    markAllRead: jest.fn(),
  },
}));

const notification = {
  id: 'notification-1',
  userId: 'user-1',
  type: 'ORDER_STATUS' as const,
  title: 'Order shipped',
  body: 'Your order is on the way.',
  relatedType: 'order',
  relatedId: 'order-1',
  readAt: null,
  createdAt: '2026-01-05T00:00:00.000Z',
};

const navigate = jest.fn();
const navigation = { navigate } as unknown as Parameters<typeof NotificationsScreen>[0]['navigation'];

describe('NotificationsScreen', () => {
  afterEach(() => {
    jest.clearAllMocks();
    jest.useRealTimers();
  });

  it('keeps a newer poll result when an older request finishes later', async () => {
    let resolveFirst!: (value: typeof notification[]) => void;
    let resolveSecond!: (value: typeof notification[]) => void;
    (notificationsApi.list as jest.Mock)
      .mockReturnValueOnce(new Promise((resolve) => { resolveFirst = resolve; }))
      .mockReturnValueOnce(new Promise((resolve) => { resolveSecond = resolve; }));

    jest.useFakeTimers();
    const { findByText } = await render(<NotificationsScreen navigation={navigation} route={{} as never} />);
    jest.advanceTimersByTime(60_000);
    resolveSecond([{ ...notification, id: 'notification-2', title: 'Newer update' }]);
    expect(await findByText('Newer update')).toBeTruthy();
    resolveFirst([notification]);

    expect(await findByText('Newer update')).toBeTruthy();
  });

  it('loads and renders unread notifications', async () => {
    (notificationsApi.list as jest.Mock).mockResolvedValue([notification]);

    const { findByText } = await render(<NotificationsScreen navigation={navigation} route={{} as never} />);

    expect(await findByText('Order shipped')).toBeTruthy();
    expect(await findByText('1 unread update')).toBeTruthy();
  });

  it('marks a notification as read', async () => {
    (notificationsApi.list as jest.Mock).mockResolvedValue([notification]);
    (notificationsApi.markRead as jest.Mock).mockResolvedValue({ ...notification, readAt: '2026-01-05T01:00:00.000Z' });

    const { findByLabelText, queryByLabelText } = await render(<NotificationsScreen navigation={navigation} route={{} as never} />);
    await fireEvent.press(await findByLabelText('Mark Order shipped as read'));

    await waitFor(() => expect(notificationsApi.markRead).toHaveBeenCalledWith('notification-1'));
    expect(queryByLabelText('Mark Order shipped as read')).toBeNull();
  });

  it('marks all notifications as read', async () => {
    (notificationsApi.list as jest.Mock).mockResolvedValue([notification]);
    (notificationsApi.markAllRead as jest.Mock).mockResolvedValue(undefined);

    const { findByLabelText, queryByLabelText } = await render(<NotificationsScreen navigation={navigation} route={{} as never} />);
    await fireEvent.press(await findByLabelText('Mark all as read'));

    await waitFor(() => expect(notificationsApi.markAllRead).toHaveBeenCalled());
    expect(queryByLabelText('Mark Order shipped as read')).toBeNull();
  });

  it('opens the related order', async () => {
    (notificationsApi.list as jest.Mock).mockResolvedValue([notification]);

    const { findByLabelText } = await render(<NotificationsScreen navigation={navigation} route={{} as never} />);
    await fireEvent.press(await findByLabelText('View order'));

    expect(navigate).toHaveBeenCalledWith('OrderDetail', { id: 'order-1' });
  });
});
