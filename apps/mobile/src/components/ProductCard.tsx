import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import type { ProductListItem } from '@ai-commerce/types';
import { formatPrice, resolveImageUrl } from '../lib/format';
import { useStore } from '../store/useStore';

type Props = {
  product: ProductListItem;
  onPress: () => void;
};

export default function ProductCard({ product, onPress }: Props) {
  const inWishlist = useStore((s) => s.wishlist?.items.some((i) => i.productId === product.id) ?? false);
  const toggleWishlistItem = useStore((s) => s.toggleWishlistItem);

  const priceLabel =
    product.minPrice == null
      ? null
      : product.minPrice !== product.maxPrice
        ? `From ${formatPrice(product.minPrice)}`
        : formatPrice(product.minPrice);

  const imageUri = resolveImageUrl(product.primaryImageUrl);

  return (
    <Pressable style={styles.card} onPress={onPress} accessibilityRole="button" accessibilityLabel={product.name}>
      <View style={styles.imageWrap}>
        {imageUri ? (
          <Image source={{ uri: imageUri }} style={styles.image} resizeMode="cover" />
        ) : (
          <View style={[styles.image, styles.imagePlaceholder]} />
        )}
        <Pressable
          style={styles.heartButton}
          onPress={() => void toggleWishlistItem(product.id)}
          accessibilityRole="button"
          accessibilityLabel={inWishlist ? 'Remove from wishlist' : 'Add to wishlist'}
        >
          <Text style={[styles.heart, inWishlist && styles.heartActive]}>{inWishlist ? '♥' : '♡'}</Text>
        </Pressable>
        {!product.inStock && (
          <View style={styles.outOfStockBadge}>
            <Text style={styles.outOfStockText}>Out of stock</Text>
          </View>
        )}
      </View>
      {product.brand && <Text style={styles.brand}>{product.brand.name}</Text>}
      <Text style={styles.name} numberOfLines={2}>
        {product.name}
      </Text>
      {priceLabel && <Text style={styles.price}>{priceLabel}</Text>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { flex: 1, margin: 6, backgroundColor: '#fff', borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: '#e5e7eb' },
  imageWrap: { position: 'relative', aspectRatio: 1, backgroundColor: '#f9fafb' },
  image: { width: '100%', height: '100%' },
  imagePlaceholder: { backgroundColor: '#f3f4f6' },
  heartButton: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.9)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heart: { fontSize: 16, color: '#6b7280' },
  heartActive: { color: '#b45309' },
  outOfStockBadge: {
    position: 'absolute',
    bottom: 8,
    left: 8,
    right: 8,
    backgroundColor: 'rgba(17,24,39,0.85)',
    borderRadius: 6,
    paddingVertical: 4,
    alignItems: 'center',
  },
  outOfStockText: { color: '#fff', fontSize: 10, fontWeight: '700', textTransform: 'uppercase' },
  brand: { fontSize: 10, fontWeight: '700', color: '#9ca3af', textTransform: 'uppercase', marginTop: 8, marginHorizontal: 8 },
  name: { fontSize: 13, fontWeight: '500', marginTop: 2, marginHorizontal: 8, minHeight: 34 },
  price: { fontSize: 14, fontWeight: '700', marginTop: 4, marginHorizontal: 8, marginBottom: 10 },
});
