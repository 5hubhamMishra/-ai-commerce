import { startTransition, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { OrderDetail } from '@ai-commerce/types';
import { ordersApi } from '@ai-commerce/api-client';
import { formatPrice } from '../lib/format';
import {
  ORDER_PROGRESS_STAGES,
  ORDER_STATUS_BADGE,
  ORDER_STATUS_LABELS,
  isCancellable,
  isOnHappyPath,
  progressStageIndex,
} from '../lib/order-status';
import type { OrderStackParamList } from '../navigation/types';
import WriteReviewAction from '../components/WriteReviewAction';

type Props = NativeStackScreenProps<OrderStackParamList, 'OrderDetail'>;

const BADGE_COLORS: Record<string, { bg: string; text: string }> = {
  success: { bg: '#dcfce7', text: '#16a34a' },
  warning: { bg: '#fef3c7', text: '#b45309' },
  error: { bg: '#fee2e2', text: '#dc2626' },
  accent: { bg: '#f3f4f6', text: '#111827' },
  subtle: { bg: '#f3f4f6', text: '#6b7280' },
};

export default function OrderDetailScreen({ route }: Props) {
  const { id } = route.params;

  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    startTransition(() => setLoading(true));
    ordersApi
      .get(id)
      .then((res) => {
        if (!cancelled) setOrder(res);
      })
      .catch(() => {
        if (!cancelled) setOrder(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  async function onCancel() {
    setCancelError(null);
    setCancelling(true);
    try {
      const updated = await ordersApi.cancel(id);
      setOrder(updated);
    } catch (err) {
      setCancelError(err instanceof Error ? err.message : "Couldn't cancel this order.");
    } finally {
      setCancelling(false);
    }
  }

  if (loading) {
    return <ActivityIndicator style={styles.centerSpinner} />;
  }

  if (!order) {
    return (
      <View style={styles.centerMessage}>
        <Text style={styles.emptyText}>Order not found.</Text>
      </View>
    );
  }

  const badgeColors = BADGE_COLORS[ORDER_STATUS_BADGE[order.status]];
  const onHappyPath = isOnHappyPath(order.status);
  const stageIndex = onHappyPath ? Math.max(0, progressStageIndex(order.status)) : -1;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <View>
          <Text style={styles.orderLabel}>Order</Text>
          <Text style={styles.orderId}>{order.id}</Text>
          <Text style={styles.placedDate}>
            Placed {new Date(order.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}
          </Text>
        </View>
        <View style={[styles.badge, { backgroundColor: badgeColors.bg }]}>
          <Text style={[styles.badgeText, { color: badgeColors.text }]}>{ORDER_STATUS_LABELS[order.status]}</Text>
        </View>
      </View>

      {order.cancelReason && <Text style={styles.cancelReason}>Cancellation reason: {order.cancelReason}</Text>}

      {onHappyPath && (
        <View style={styles.progressSection}>
          <Text style={styles.sectionHeading}>Order progress</Text>
          <View style={styles.stageRow}>
            {ORDER_PROGRESS_STAGES.map((stage, i) => {
              const done = i <= stageIndex;
              return (
                <View key={stage} style={styles.stage}>
                  <View style={[styles.stageDot, done && styles.stageDotDone]}>
                    <Text style={[styles.stageDotText, done && styles.stageDotTextDone]}>{done ? '✓' : i + 1}</Text>
                  </View>
                  <Text style={[styles.stageLabel, done && styles.stageLabelDone]}>{ORDER_STATUS_LABELS[stage]}</Text>
                </View>
              );
            })}
          </View>
        </View>
      )}

      <View style={styles.itemsSection}>
        <Text style={styles.sectionHeading}>Items ordered</Text>
        {order.items.map((item) => (
          <View key={item.id} style={styles.itemRow}>
            <View style={styles.itemDetails}>
              <Text style={styles.itemName} numberOfLines={1}>
                {item.productName}
              </Text>
              <Text style={styles.itemMeta}>
                {item.sku} · Qty: {item.quantity}
              </Text>
              {order.status === 'DELIVERED' && (
                <View style={styles.reviewAction}>
                  <WriteReviewAction
                    orderId={order.id}
                    productSlug={item.productSlug}
                    productName={item.productName}
                  />
                </View>
              )}
            </View>
            <Text style={styles.itemTotal}>{formatPrice(item.lineTotal)}</Text>
          </View>
        ))}
        <View style={styles.divider} />
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Subtotal</Text>
          <Text style={styles.summaryValue}>{formatPrice(order.subtotal)}</Text>
        </View>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Shipping ({order.shippingMethod})</Text>
          <Text style={styles.summaryValue}>{order.shippingFee === 0 ? 'Free' : formatPrice(order.shippingFee)}</Text>
        </View>
        {order.discountTotal > 0 && (
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Discount</Text>
            <Text style={styles.summaryValue}>-{formatPrice(order.discountTotal)}</Text>
          </View>
        )}
        {order.taxTotal > 0 && (
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Tax</Text>
            <Text style={styles.summaryValue}>{formatPrice(order.taxTotal)}</Text>
          </View>
        )}
        <View style={styles.divider} />
        <View style={styles.summaryRow}>
          <Text style={styles.totalLabel}>Total</Text>
          <Text style={styles.totalValue}>{formatPrice(order.total)}</Text>
        </View>
      </View>

      {order.shipment && (
        <View style={styles.section}>
          <Text style={styles.sectionHeading}>Shipment</Text>
          <Text style={styles.shipmentCarrier}>
            {order.shipment.carrier ?? 'Carrier not yet assigned'}
            {order.shipment.trackingNumber ? ` · ${order.shipment.trackingNumber}` : ''}
          </Text>
          {order.shipment.events.length > 0 && (
            <View style={styles.eventList}>
              {order.shipment.events.map((e, i) => (
                <View key={i} style={styles.eventRow}>
                  <Text style={styles.eventText}>
                    {e.status.replaceAll('_', ' ')}
                    {e.location ? ` — ${e.location}` : ''}
                  </Text>
                  <Text style={styles.eventDate}>
                    {new Date(e.occurredAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                  </Text>
                </View>
              ))}
            </View>
          )}
        </View>
      )}

      <View style={styles.section}>
        <Text style={styles.sectionHeading}>Shipping to</Text>
        <Text style={styles.addressText}>
          {order.address.line1}
          {order.address.line2 ? `, ${order.address.line2}` : ''}, {order.address.city}, {order.address.state}{' '}
          {order.address.postalCode}, {order.address.country}
        </Text>
      </View>

      {cancelError && (
        <Text style={styles.errorText} accessibilityRole="alert">
          {cancelError}
        </Text>
      )}

      {isCancellable(order.status) && (
        <Pressable
          style={styles.cancelButton}
          onPress={() => void onCancel()}
          disabled={cancelling}
          accessibilityRole="button"
          accessibilityLabel="Cancel order"
        >
          <Text style={styles.cancelButtonText}>{cancelling ? 'Cancelling…' : 'Cancel order'}</Text>
        </Pressable>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  content: { padding: 16, paddingBottom: 40 },
  centerSpinner: { flex: 1, marginTop: 60 },
  centerMessage: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  emptyText: { color: '#6b7280' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  orderLabel: { fontSize: 11, fontWeight: '700', color: '#9ca3af', textTransform: 'uppercase' },
  orderId: { fontSize: 15, fontWeight: '700', color: '#111827', marginTop: 2 },
  placedDate: { fontSize: 12, color: '#6b7280', marginTop: 4 },
  badge: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  badgeText: { fontSize: 11, fontWeight: '700' },
  cancelReason: { fontSize: 13, color: '#6b7280', marginTop: 8 },
  sectionHeading: { fontSize: 11, fontWeight: '700', color: '#9ca3af', textTransform: 'uppercase', marginBottom: 10 },
  progressSection: { marginTop: 20, borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 12, padding: 14 },
  stageRow: { flexDirection: 'row', justifyContent: 'space-between' },
  stage: { alignItems: 'center', flex: 1, gap: 4 },
  stageDot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: '#e5e7eb',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stageDotDone: { backgroundColor: '#b45309', borderColor: '#b45309' },
  stageDotText: { fontSize: 10, fontWeight: '700', color: '#9ca3af' },
  stageDotTextDone: { color: '#fff' },
  stageLabel: { fontSize: 9, fontWeight: '600', color: '#9ca3af', textAlign: 'center' },
  stageLabelDone: { color: '#111827' },
  itemsSection: { marginTop: 20, borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 12, padding: 14 },
  itemRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', paddingVertical: 8 },
  itemDetails: { flex: 1, marginRight: 8 },
  itemName: { fontSize: 13, fontWeight: '600', color: '#111827' },
  itemMeta: { fontSize: 11, color: '#9ca3af', marginTop: 2 },
  reviewAction: { marginTop: 6 },
  itemTotal: { fontSize: 13, fontWeight: '700', color: '#111827' },
  divider: { height: 1, backgroundColor: '#e5e7eb', marginVertical: 8 },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 },
  summaryLabel: { fontSize: 13, color: '#6b7280' },
  summaryValue: { fontSize: 13, fontWeight: '600', color: '#111827' },
  totalLabel: { fontSize: 15, fontWeight: '700', color: '#111827' },
  totalValue: { fontSize: 17, fontWeight: '700', color: '#111827' },
  section: { marginTop: 16, borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 12, padding: 14 },
  shipmentCarrier: { fontSize: 13, color: '#111827' },
  eventList: { marginTop: 8, gap: 6 },
  eventRow: { flexDirection: 'row', justifyContent: 'space-between' },
  eventText: { fontSize: 12, color: '#6b7280' },
  eventDate: { fontSize: 12, color: '#6b7280' },
  addressText: { fontSize: 13, color: '#111827', lineHeight: 19 },
  errorText: { color: '#dc2626', marginTop: 16, textAlign: 'center' },
  cancelButton: { marginTop: 20, alignItems: 'center', paddingVertical: 10 },
  cancelButtonText: { fontSize: 14, fontWeight: '600', color: '#dc2626' },
});
