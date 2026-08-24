import { startTransition, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { OrderListItem } from '@ai-commerce/types';
import { ordersApi } from '@ai-commerce/api-client';
import { formatPrice } from '../lib/format';
import { ORDER_STATUS_BADGE, ORDER_STATUS_LABELS } from '../lib/order-status';
import type { AccountStackParamList } from '../navigation/types';

const PAGE_SIZE = 20;

type Props = NativeStackScreenProps<AccountStackParamList, 'OrderList'>;

const BADGE_COLORS: Record<string, { bg: string; text: string }> = {
  success: { bg: '#dcfce7', text: '#16a34a' },
  warning: { bg: '#fef3c7', text: '#b45309' },
  error: { bg: '#fee2e2', text: '#dc2626' },
  accent: { bg: '#f3f4f6', text: '#111827' },
  subtle: { bg: '#f3f4f6', text: '#6b7280' },
};

function StatusBadge({ status }: { status: OrderListItem['status'] }) {
  const colors = BADGE_COLORS[ORDER_STATUS_BADGE[status]];
  return (
    <View style={[styles.badge, { backgroundColor: colors.bg }]}>
      <Text style={[styles.badgeText, { color: colors.text }]}>{ORDER_STATUS_LABELS[status]}</Text>
    </View>
  );
}

export default function OrderListScreen({ navigation }: Props) {
  const [items, setItems] = useState<OrderListItem[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    startTransition(() => {
      if (page === 1) setLoading(true);
      else setLoadingMore(true);
      setError(null);
    });
    ordersApi
      .list({ page, pageSize: PAGE_SIZE })
      .then((res) => {
        if (cancelled) return;
        setItems((prev) => (page === 1 ? res.items : [...prev, ...res.items]));
        setTotal(res.total);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load your orders.');
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
          setLoadingMore(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [page]);

  if (loading) {
    return <ActivityIndicator style={styles.centerSpinner} />;
  }

  if (error) {
    return (
      <View style={styles.centerMessage}>
        <Text style={styles.errorText} accessibilityRole="alert">
          {error}
        </Text>
      </View>
    );
  }

  if (items.length === 0) {
    return (
      <View style={styles.centerMessage}>
        <Text style={styles.emptyText}>You haven&apos;t placed any orders yet.</Text>
      </View>
    );
  }

  return (
    <FlatList
      testID="order-list"
      style={styles.container}
      data={items}
      keyExtractor={(item) => item.id}
      contentContainerStyle={styles.list}
      renderItem={({ item }) => (
        <Pressable
          style={styles.row}
          onPress={() => navigation.navigate('OrderDetail', { id: item.id })}
          accessibilityRole="button"
          accessibilityLabel={`Order ${item.id.slice(0, 8)}`}
        >
          <View style={styles.rowLeft}>
            <Text style={styles.orderId}>{item.id.slice(0, 8)}</Text>
            <Text style={styles.orderDate}>
              {new Date(item.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
            </Text>
            <Text style={styles.itemCount}>
              {item.itemCount} item{item.itemCount > 1 ? 's' : ''}
            </Text>
          </View>
          <View style={styles.rowRight}>
            <Text style={styles.total}>{formatPrice(item.total)}</Text>
            <StatusBadge status={item.status} />
          </View>
        </Pressable>
      )}
      onEndReachedThreshold={0.5}
      onEndReached={() => {
        if (!loadingMore && items.length < total) setPage((p) => p + 1);
      }}
      ListFooterComponent={loadingMore ? <ActivityIndicator style={styles.footerSpinner} /> : null}
    />
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  centerSpinner: { flex: 1, marginTop: 60 },
  centerMessage: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  errorText: { color: '#dc2626', textAlign: 'center' },
  emptyText: { color: '#6b7280', textAlign: 'center' },
  list: { padding: 12 },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
  },
  rowLeft: { gap: 2 },
  orderId: { fontSize: 11, fontWeight: '700', color: '#9ca3af', textTransform: 'uppercase' },
  orderDate: { fontSize: 14, fontWeight: '600', color: '#111827' },
  itemCount: { fontSize: 12, color: '#6b7280' },
  rowRight: { alignItems: 'flex-end', gap: 6 },
  total: { fontSize: 16, fontWeight: '700', color: '#111827' },
  badge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  badgeText: { fontSize: 10, fontWeight: '700' },
  footerSpinner: { marginVertical: 16 },
});
