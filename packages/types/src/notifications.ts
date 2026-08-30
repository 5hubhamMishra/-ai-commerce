export type NotificationType =
  | 'ORDER_STATUS'
  | 'PAYMENT'
  | 'RETURN'
  | 'REFUND'
  | 'REPLACEMENT'
  | 'EXCHANGE'
  | 'SUPPORT'
  | 'SYSTEM';

export type Notification = {
  id: string;
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  relatedType: string | null;
  relatedId: string | null;
  readAt: string | null;
  createdAt: string;
};
