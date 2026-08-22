import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { WishlistItemResponse } from '@ai-commerce/types';
import { useStore } from '../store/useStore';
import { formatPrice, resolveImageUrl } from '../lib/format';
import type { WishlistStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<WishlistStackParamList, 'WishlistHome'>;

export default function WishlistScreen({ navigation }: Props) {
  const wishlist = useStore((s) => s.wishlist);
  const wishlistStatus = useStore((s) => s.wishlistStatus);
  const fetchWishlist = useStore((s) => s.fetchWishlist);
  const toggleWishlistItem = useStore((s) => s.toggleWishlistItem);

  const [pendingId, setPendingId] = useState<string | null>(null);

  useEffect(() => {
    void fetchWishlist();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleRemove(item: WishlistItemResponse) {
    setPendingId(item.productId);
    try {
      await toggleWishlistItem(item.productId);
    } finally {
      setPendingId(null);
    }
  }

  if (wishlistStatus === 'loading' && !wishlist) {
    return <ActivityIndicator style={styles.centerSpinner} />;
  }

  if (wishlistStatus === 'error' && !wishlist) {
    return (
      <View style={styles.centerMessage}>
        <Text style={styles.errorText} accessibilityRole="alert">
          Could not load your wishlist.
        </Text>
      </View>
    );
  }

  if (!wishlist || wishlist.items.length === 0) {
    return (
      <View style={styles.centerMessage}>
        <Text style={styles.emptyText}>Your wishlist is empty.</Text>
      </View>
    );
  }

  return (
    <FlatList
      style={styles.container}
      data={wishlist.items}
      keyExtractor={(item) => item.productId}
      contentContainerStyle={styles.list}
      renderItem={({ item }) => (
        <Pressable
          style={styles.row}
          onPress={() => navigation.navigate('ProductDetail', { slug: item.slug })}
          accessibilityRole="button"
          accessibilityLabel={item.name}
        >
          {item.imageUrl ? (
            <Image source={{ uri: resolveImageUrl(item.imageUrl) }} style={styles.image} resizeMode="cover" />
          ) : (
            <View style={[styles.image, styles.imagePlaceholder]} />
          )}
          <View style={styles.details}>
            {item.brand && <Text style={styles.brand}>{item.brand}</Text>}
            <Text style={styles.name} numberOfLines={2}>
              {item.name}
            </Text>
            {item.minPrice != null && (
              <Text style={styles.price}>
                {item.minPrice !== item.maxPrice ? `From ${formatPrice(item.minPrice)}` : formatPrice(item.minPrice)}
              </Text>
            )}
            {!item.isAvailable && <Text style={styles.warning}>Unavailable</Text>}
          </View>
          <Pressable
            onPress={() => void handleRemove(item)}
            disabled={pendingId === item.productId}
            style={styles.heartButton}
            accessibilityRole="button"
            accessibilityLabel={`Remove ${item.name} from wishlist`}
          >
            <Text style={styles.heart}>♥</Text>
          </Pressable>
        </Pressable>
      )}
    />
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  centerSpinner: { flex: 1, marginTop: 60 },
  centerMessage: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  errorText: { color: '#dc2626', textAlign: 'center' },
  emptyText: { color: '#6b7280' },
  list: { padding: 12 },
  row: { flexDirection: 'row', gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#f3f4f6', alignItems: 'center' },
  image: { width: 64, height: 64, borderRadius: 10, backgroundColor: '#f9fafb' },
  imagePlaceholder: { backgroundColor: '#f3f4f6' },
  details: { flex: 1 },
  brand: { fontSize: 10, fontWeight: '700', color: '#9ca3af', textTransform: 'uppercase' },
  name: { fontSize: 14, fontWeight: '600', color: '#111827', marginTop: 2 },
  price: { fontSize: 13, fontWeight: '700', color: '#111827', marginTop: 4 },
  warning: { fontSize: 12, color: '#dc2626', marginTop: 4 },
  heartButton: { padding: 8 },
  heart: { fontSize: 18, color: '#b45309' },
});
