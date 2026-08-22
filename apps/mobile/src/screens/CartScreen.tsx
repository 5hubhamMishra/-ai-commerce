import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { CartItemResponse } from '@ai-commerce/types';
import { useStore } from '../store/useStore';
import { formatPrice, resolveImageUrl } from '../lib/format';
import type { CartStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<CartStackParamList, 'CartHome'>;

export default function CartScreen({ navigation }: Props) {
  const cart = useStore((s) => s.cart);
  const cartStatus = useStore((s) => s.cartStatus);
  const fetchCart = useStore((s) => s.fetchCart);
  const updateCartItem = useStore((s) => s.updateCartItem);
  const removeCartItem = useStore((s) => s.removeCartItem);

  const [pendingItemId, setPendingItemId] = useState<string | null>(null);

  useEffect(() => {
    void fetchCart();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function changeQuantity(item: CartItemResponse, nextQuantity: number) {
    setPendingItemId(item.id);
    try {
      if (nextQuantity <= 0) await removeCartItem(item.id);
      else await updateCartItem(item.id, nextQuantity);
    } finally {
      setPendingItemId(null);
    }
  }

  if (cartStatus === 'loading' && !cart) {
    return <ActivityIndicator style={styles.centerSpinner} />;
  }

  if (cartStatus === 'error' && !cart) {
    return (
      <View style={styles.centerMessage}>
        <Text style={styles.errorText} accessibilityRole="alert">
          Could not load your cart.
        </Text>
      </View>
    );
  }

  if (!cart || cart.items.length === 0) {
    return (
      <View style={styles.centerMessage}>
        <Text style={styles.emptyText}>Your cart is empty.</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={cart.items}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => {
          const pending = pendingItemId === item.id;
          return (
            <Pressable
              style={styles.row}
              onPress={() => navigation.navigate('ProductDetail', { slug: item.productSlug })}
              accessibilityRole="button"
              accessibilityLabel={item.productName}
            >
              {item.imageUrl ? (
                <Image source={{ uri: resolveImageUrl(item.imageUrl) }} style={styles.image} resizeMode="cover" />
              ) : (
                <View style={[styles.image, styles.imagePlaceholder]} />
              )}
              <View style={styles.details}>
                <Text style={styles.name} numberOfLines={2}>
                  {item.productName}
                </Text>
                {item.attributes.length > 0 && (
                  <Text style={styles.attributes}>
                    {item.attributes.map((a) => a.value).join(' / ')}
                  </Text>
                )}
                <Text style={styles.price}>{formatPrice(item.unitPrice)}</Text>

                {!item.isAvailable ? (
                  <Text style={styles.warning}>No longer available</Text>
                ) : item.insufficientStock ? (
                  <Text style={styles.warning}>Only {item.availableQuantity} left in stock</Text>
                ) : null}

                <View style={styles.actionsRow}>
                  <View style={styles.qtyStepper}>
                    <Pressable
                      onPress={() => void changeQuantity(item, item.quantity - 1)}
                      disabled={pending}
                      style={styles.qtyButton}
                      accessibilityRole="button"
                      accessibilityLabel={`Decrease quantity of ${item.productName}`}
                    >
                      <Text style={styles.qtyButtonText}>−</Text>
                    </Pressable>
                    <Text style={styles.qtyValue} accessibilityLiveRegion="polite">
                      {item.quantity}
                    </Text>
                    <Pressable
                      onPress={() => void changeQuantity(item, item.quantity + 1)}
                      disabled={pending}
                      style={styles.qtyButton}
                      accessibilityRole="button"
                      accessibilityLabel={`Increase quantity of ${item.productName}`}
                    >
                      <Text style={styles.qtyButtonText}>+</Text>
                    </Pressable>
                  </View>
                  <Pressable
                    onPress={() => void changeQuantity(item, 0)}
                    disabled={pending}
                    accessibilityRole="button"
                    accessibilityLabel={`Remove ${item.productName} from cart`}
                  >
                    <Text style={styles.removeText}>Remove</Text>
                  </Pressable>
                </View>
              </View>
            </Pressable>
          );
        }}
      />
      <View style={styles.footer}>
        <Text style={styles.footerLabel}>Subtotal ({cart.itemCount})</Text>
        <Text style={styles.footerTotal}>{formatPrice(cart.subtotal)}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  centerSpinner: { flex: 1, marginTop: 60 },
  centerMessage: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  errorText: { color: '#dc2626', textAlign: 'center' },
  emptyText: { color: '#6b7280' },
  list: { padding: 12 },
  row: { flexDirection: 'row', gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  image: { width: 72, height: 72, borderRadius: 10, backgroundColor: '#f9fafb' },
  imagePlaceholder: { backgroundColor: '#f3f4f6' },
  details: { flex: 1 },
  name: { fontSize: 14, fontWeight: '600', color: '#111827' },
  attributes: { fontSize: 12, color: '#6b7280', marginTop: 2 },
  price: { fontSize: 14, fontWeight: '700', color: '#111827', marginTop: 4 },
  warning: { fontSize: 12, color: '#dc2626', marginTop: 4 },
  actionsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 },
  qtyStepper: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8 },
  qtyButton: { paddingHorizontal: 10, paddingVertical: 6 },
  qtyButtonText: { fontSize: 15, fontWeight: '600', color: '#374151' },
  qtyValue: { width: 20, textAlign: 'center', fontSize: 13, fontWeight: '600', color: '#111827' },
  removeText: { fontSize: 12, fontWeight: '600', color: '#b45309' },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
  },
  footerLabel: { fontSize: 13, color: '#6b7280' },
  footerTotal: { fontSize: 18, fontWeight: '700', color: '#111827' },
});
