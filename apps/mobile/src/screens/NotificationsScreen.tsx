import { startTransition, useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { Notification } from '@ai-commerce/types';
import { notificationsApi } from '@ai-commerce/api-client';
import type { AccountStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<AccountStackParamList, 'Notifications'>;

const notificationDate = new Intl.DateTimeFormat('en-IN', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
});

function invalidate(operation: { current: number }) {
  operation.current++;
}

export default function NotificationsScreen({ navigation }: Props) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [actionError, setActionError] = useState(false);
  const notificationOperation = useRef(0);

  const loadNotifications = useCallback(async () => {
    const operation = ++notificationOperation.current;
    setLoading(true);
    try {
      const next = await notificationsApi.list();
      if (operation !== notificationOperation.current) return;
      setNotifications(next);
      setError(false);
    } catch {
      if (operation === notificationOperation.current) setError(true);
    } finally {
      if (operation === notificationOperation.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    startTransition(() => void loadNotifications());
    const interval = setInterval(() => void loadNotifications(), 60_000);
    return () => {
      invalidate(notificationOperation);
      clearInterval(interval);
    };
  }, [loadNotifications]);

  async function markRead(id: string) {
    const operation = ++notificationOperation.current;
    setActionError(false);
    try {
      const updated = await notificationsApi.markRead(id);
      if (operation !== notificationOperation.current) return;
      setNotifications((current) =>
        current.map((notification) =>
          notification.id === id ? { ...notification, readAt: updated.readAt } : notification,
        ),
      );
    } catch {
      if (operation === notificationOperation.current) setActionError(true);
    }
  }

  async function markAllRead() {
    const operation = ++notificationOperation.current;
    setActionError(false);
    try {
      await notificationsApi.markAllRead();
      if (operation !== notificationOperation.current) return;
      setNotifications((current) =>
        current.map((notification) => ({
          ...notification,
          readAt: notification.readAt ?? new Date().toISOString(),
        })),
      );
    } catch {
      if (operation === notificationOperation.current) setActionError(true);
    }
  }

  if (loading && notifications.length === 0) return <ActivityIndicator style={styles.centerSpinner} />;

  if (error && notifications.length === 0) {
    return (
      <View style={styles.centerMessage}>
        <Text style={styles.errorText} accessibilityRole="alert">Could not load your notifications.</Text>
        <Pressable onPress={() => void loadNotifications()} style={styles.retryButton} accessibilityRole="button" accessibilityLabel="Try again">
          <Text style={styles.retryText}>Try again</Text>
        </Pressable>
      </View>
    );
  }

  const unreadCount = notifications.filter((notification) => !notification.readAt).length;

  return (
    <FlatList
      style={styles.container}
      data={notifications}
      keyExtractor={(notification) => notification.id}
      contentContainerStyle={notifications.length === 0 ? styles.emptyList : styles.list}
      ListHeaderComponent={
        <View style={styles.header}>
          <Text style={styles.subtitle}>
            {unreadCount === 0 ? 'You are all caught up.' : `${unreadCount} unread update${unreadCount === 1 ? '' : 's'}`}
          </Text>
          {unreadCount > 0 && (
            <Pressable onPress={() => void markAllRead()} accessibilityRole="button" accessibilityLabel="Mark all as read">
              <Text style={styles.actionText}>Mark all as read</Text>
            </Pressable>
          )}
        </View>
      }
      ListEmptyComponent={<Text style={styles.emptyText}>Order and account updates will appear here.</Text>}
      renderItem={({ item }) => (
        <View style={[styles.row, !item.readAt && styles.unreadRow]}>
          <View style={styles.rowContent}>
            <View style={styles.titleRow}>
              <Text style={styles.title}>{item.title}</Text>
              {!item.readAt && <View style={styles.unreadDot} accessibilityLabel="Unread" />}
            </View>
            <Text style={styles.body}>{item.body}</Text>
            <Text style={styles.date}>{notificationDate.format(new Date(item.createdAt))}</Text>
            {item.relatedType === 'order' && item.relatedId && (
              <Pressable
                onPress={() => navigation.navigate('OrderDetail', { id: item.relatedId! })}
                accessibilityRole="button"
                accessibilityLabel="View order"
              >
                <Text style={styles.orderText}>View order</Text>
              </Pressable>
            )}
            {!item.readAt && (
              <Pressable onPress={() => void markRead(item.id)} accessibilityRole="button" accessibilityLabel={`Mark ${item.title} as read`}>
                <Text style={styles.readText}>Mark as read</Text>
              </Pressable>
            )}
          </View>
        </View>
      )}
      ListFooterComponent={actionError ? <Text style={styles.errorText}>Could not update your notifications.</Text> : null}
    />
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  centerSpinner: { flex: 1, marginTop: 60 },
  centerMessage: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  list: { padding: 12 },
  emptyList: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 12 },
  subtitle: { flex: 1, color: '#6b7280', fontSize: 13 },
  actionText: { color: '#b45309', fontSize: 13, fontWeight: '700' },
  row: { borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 12, padding: 14, marginBottom: 10 },
  unreadRow: { backgroundColor: '#fffbeb', borderColor: '#fde68a' },
  rowContent: { gap: 6 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { flex: 1, color: '#111827', fontSize: 15, fontWeight: '700' },
  body: { color: '#4b5563', fontSize: 14, lineHeight: 20 },
  date: { color: '#9ca3af', fontSize: 11 },
  unreadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#b45309' },
  readText: { alignSelf: 'flex-start', color: '#6b7280', fontSize: 13, textDecorationLine: 'underline' },
  orderText: { alignSelf: 'flex-start', color: '#b45309', fontSize: 13, fontWeight: '700' },
  emptyText: { color: '#6b7280', textAlign: 'center' },
  errorText: { color: '#dc2626', textAlign: 'center' },
  retryButton: { marginTop: 14, backgroundColor: '#111827', borderRadius: 8, paddingHorizontal: 18, paddingVertical: 10 },
  retryText: { color: '#fff', fontWeight: '700' },
});
