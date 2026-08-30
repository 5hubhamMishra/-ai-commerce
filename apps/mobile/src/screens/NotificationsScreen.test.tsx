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

describe('NotificationsScreen', () => {
  afterEach(() => jest.clearAllMocks());

  it('loads and renders unread notifications', async () => {
    (notificationsApi.list as jest.Mock).mockResolvedValue([notification]);

    const { findByText } = await render(<NotificationsScreen />);

    expect(await findByText('Order shipped')).toBeTruthy();
    expect(await findByText('1 unread update')).toBeTruthy();
  });

  it('marks a notification as read', async () => {
    (notificationsApi.list as jest.Mock).mockResolvedValue([notification]);
    (notificationsApi.markRead as jest.Mock).mockResolvedValue({ ...notification, readAt: '2026-01-05T01:00:00.000Z' });

    const { findByLabelText, queryByLabelText } = await render(<NotificationsScreen />);
    await fireEvent.press(await findByLabelText('Mark Order shipped as read'));

    await waitFor(() => expect(notificationsApi.markRead).toHaveBeenCalledWith('notification-1'));
    expect(queryByLabelText('Mark Order shipped as read')).toBeNull();
  });

  it('marks all notifications as read', async () => {
    (notificationsApi.list as jest.Mock).mockResolvedValue([notification]);
    (notificationsApi.markAllRead as jest.Mock).mockResolvedValue(undefined);

    const { findByLabelText, queryByLabelText } = await render(<NotificationsScreen />);
    await fireEvent.press(await findByLabelText('Mark all as read'));

    await waitFor(() => expect(notificationsApi.markAllRead).toHaveBeenCalled());
    expect(queryByLabelText('Mark Order shipped as read')).toBeNull();
  });
});
