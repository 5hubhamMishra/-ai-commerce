import { startTransition, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { ProductDetail, ProductSpecification, ProductVariant } from '@ai-commerce/types';
import { catalogApi } from '@ai-commerce/api-client';
import VariantPicker from '../components/VariantPicker';
import RecommendationRail from '../components/RecommendationRail';
import ProductReviews from '../components/ProductReviews';
import { useStore } from '../store/useStore';
import { formatPrice, resolveImageUrl } from '../lib/format';
import { useRecommendations } from '../lib/useRecommendations';
import type { ProductStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<ProductStackParamList, 'ProductDetail'>;

export default function ProductDetailScreen({ navigation, route }: Props) {
  const { slug } = route.params;

  const [product, setProduct] = useState<ProductDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const addCartItem = useStore((s) => s.addCartItem);
  const inWishlist = useStore(
    (s) => s.wishlist?.items.some((i) => i.productId === product?.id) ?? false,
  );
  const toggleWishlistItem = useStore((s) => s.toggleWishlistItem);

  const frequentlyBoughtWith = useRecommendations('frequentlyBoughtWith', { productId: product?.id, limit: 3 });
  const similar = useRecommendations('similar', { productId: product?.id, limit: 6 });

  const [selectedVariant, setSelectedVariant] = useState<ProductVariant | null>(null);
  const [qty, setQty] = useState(1);
  const [activeImage, setActiveImage] = useState(0);
  const [adding, setAdding] = useState(false);
  const [added, setAdded] = useState(false);
  const [wishlistPending, setWishlistPending] = useState(false);
  const [cartError, setCartError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    startTransition(() => {
      setLoading(true);
      setError(null);
    });
    catalogApi
      .getProductBySlug(slug)
      .then((res) => {
        if (cancelled) return;
        setProduct(res);
        setSelectedVariant(null);
        setActiveImage(0);
        setQty(1);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load this product.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [slug]);

  const specGroups = useMemo(() => {
    if (!product) return [] as [string, ProductSpecification[]][];
    const groups = new Map<string, ProductSpecification[]>();
    for (const spec of [...product.specifications].sort((a, b) => a.sortOrder - b.sortOrder)) {
      if (!groups.has(spec.group)) groups.set(spec.group, []);
      groups.get(spec.group)!.push(spec);
    }
    return [...groups.entries()];
  }, [product]);

  if (loading) {
    return <ActivityIndicator style={styles.centerSpinner} />;
  }

  if (error || !product) {
    return (
      <View style={styles.centerMessage}>
        <Text style={styles.errorText} accessibilityRole="alert">
          {error ?? 'Product not found.'}
        </Text>
      </View>
    );
  }

  const images = product.images;
  const priceLabel = selectedVariant
    ? formatPrice(selectedVariant.price)
    : product.minPrice == null
      ? null
      : product.minPrice !== product.maxPrice
        ? `From ${formatPrice(product.minPrice)}`
        : formatPrice(product.minPrice);
  const compareAtPrice = selectedVariant?.compareAtPrice ?? null;
  const savings = compareAtPrice && selectedVariant ? compareAtPrice - selectedVariant.price : 0;
  const inStock = selectedVariant ? selectedVariant.availableQuantity > 0 : product.inStock;

  async function handleAddToCart() {
    if (!selectedVariant) return;
    setCartError(null);
    setAdding(true);
    try {
      await addCartItem(selectedVariant.id, qty);
      setAdded(true);
      setTimeout(() => setAdded(false), 1400);
    } catch (err) {
      setCartError(err instanceof Error ? err.message : "Couldn't add this to your cart.");
    } finally {
      setAdding(false);
    }
  }

  async function handleWishlist() {
    setWishlistPending(true);
    try {
      await toggleWishlistItem(product!.id);
    } finally {
      setWishlistPending(false);
    }
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.imageWrap}>
        {images.length > 0 ? (
          <Image
            source={{ uri: resolveImageUrl(images[activeImage]?.url ?? images[0].url) }}
            style={styles.image}
            resizeMode="cover"
          />
        ) : (
          <View style={[styles.image, styles.imagePlaceholder]} />
        )}
      </View>
      {images.length > 1 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.thumbRow}>
          {images.map((img, i) => (
            <Pressable
              key={img.id}
              onPress={() => setActiveImage(i)}
              style={[styles.thumb, activeImage === i && styles.thumbActive]}
              accessibilityRole="button"
              accessibilityLabel={`Show image ${i + 1} of ${images.length}`}
              accessibilityState={{ selected: activeImage === i }}
            >
              <Image source={{ uri: resolveImageUrl(img.url) }} style={styles.thumbImage} resizeMode="cover" />
            </Pressable>
          ))}
        </ScrollView>
      )}

      {product.brand && <Text style={styles.brand}>{product.brand.name}</Text>}
      <Text style={styles.name}>{product.name}</Text>

      <View style={styles.priceRow}>
        {priceLabel && <Text style={styles.price}>{priceLabel}</Text>}
        {compareAtPrice && selectedVariant && (
          <Text style={styles.compareAtPrice}>{formatPrice(compareAtPrice)}</Text>
        )}
        {savings > 0 && (
          <View style={styles.savingsBadge}>
            <Text style={styles.savingsText}>Save {formatPrice(savings)}</Text>
          </View>
        )}
      </View>

      <Text style={styles.description}>{product.description}</Text>

      {product.variants.length > 0 && (
        <View style={styles.variantSection}>
          <VariantPicker variants={product.variants} onSelect={setSelectedVariant} />
        </View>
      )}

      <View style={styles.stockRow}>
        <View style={[styles.stockDot, { backgroundColor: inStock ? '#16a34a' : '#dc2626' }]} />
        <Text style={[styles.stockText, !inStock && styles.stockTextOut]}>
          {inStock ? 'In stock' : 'Out of stock'}
        </Text>
      </View>

      {cartError && (
        <Text style={styles.errorText} accessibilityRole="alert">
          {cartError}
        </Text>
      )}

      <View style={styles.actionRow}>
        <View style={styles.qtyStepper}>
          <Pressable
            onPress={() => setQty((q) => Math.max(1, q - 1))}
            style={styles.qtyButton}
            accessibilityRole="button"
            accessibilityLabel="Decrease quantity"
          >
            <Text style={styles.qtyButtonText}>−</Text>
          </Pressable>
          <Text style={styles.qtyValue} accessibilityLiveRegion="polite">
            {qty}
          </Text>
          <Pressable
            onPress={() => setQty((q) => q + 1)}
            style={styles.qtyButton}
            accessibilityRole="button"
            accessibilityLabel="Increase quantity"
          >
            <Text style={styles.qtyButtonText}>+</Text>
          </Pressable>
        </View>

        <Pressable
          onPress={() => void handleAddToCart()}
          disabled={!inStock || !selectedVariant || adding}
          style={[styles.addButton, (!inStock || !selectedVariant || adding) && styles.addButtonDisabled]}
          accessibilityRole="button"
          accessibilityLabel="Add to cart"
        >
          <Text style={styles.addButtonText}>
            {!inStock ? 'Unavailable' : added ? '✓ Added' : adding ? 'Adding…' : 'Add to cart'}
          </Text>
        </Pressable>

        <Pressable
          onPress={() => void handleWishlist()}
          disabled={wishlistPending}
          style={[styles.wishlistButton, inWishlist && styles.wishlistButtonActive]}
          accessibilityRole="button"
          accessibilityLabel={inWishlist ? 'Remove from wishlist' : 'Add to wishlist'}
          accessibilityState={{ selected: inWishlist }}
        >
          <Text style={[styles.wishlistButtonText, inWishlist && styles.wishlistButtonTextActive]}>
            {inWishlist ? '♥' : '♡'}
          </Text>
        </Pressable>
      </View>

      {specGroups.length > 0 && (
        <View style={styles.specSection}>
          <Text style={styles.specHeading}>Specifications</Text>
          {specGroups.map(([group, specs]) => (
            <View key={group} style={styles.specGroup}>
              {specGroups.length > 1 && <Text style={styles.specGroupLabel}>{group}</Text>}
              <View style={styles.specList}>
                {specs.map((spec, i) => (
                  <View key={spec.id} style={[styles.specRow, i % 2 === 0 && styles.specRowAlt]}>
                    <Text style={styles.specKey}>{spec.key}</Text>
                    <Text style={styles.specValue}>{spec.value}</Text>
                  </View>
                ))}
              </View>
            </View>
          ))}
        </View>
      )}

      <ProductReviews
        productSlug={product.slug}
        summary={{ average: product.rating, count: product.reviewCount }}
      />

      {frequentlyBoughtWith && (
        <RecommendationRail
          title="Frequently bought together"
          products={frequentlyBoughtWith.map((r) => r.product)}
          onPressProduct={(p) => navigation.push('ProductDetail', { slug: p.slug })}
        />
      )}

      {similar && (
        <RecommendationRail
          title="Similar products"
          products={similar.map((r) => r.product)}
          onPressProduct={(p) => navigation.push('ProductDetail', { slug: p.slug })}
        />
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  content: { padding: 16, paddingBottom: 40 },
  centerSpinner: { flex: 1, marginTop: 60 },
  centerMessage: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  errorText: { color: '#dc2626', marginTop: 8 },
  imageWrap: { aspectRatio: 1, borderRadius: 16, overflow: 'hidden', backgroundColor: '#f9fafb' },
  image: { width: '100%', height: '100%' },
  imagePlaceholder: { backgroundColor: '#f3f4f6' },
  thumbRow: { marginTop: 10 },
  thumb: { width: 56, height: 56, borderRadius: 10, overflow: 'hidden', marginRight: 8, borderWidth: 2, borderColor: 'transparent' },
  thumbActive: { borderColor: '#b45309' },
  thumbImage: { width: '100%', height: '100%' },
  brand: { fontSize: 11, fontWeight: '700', color: '#9ca3af', textTransform: 'uppercase', marginTop: 16 },
  name: { fontSize: 22, fontWeight: '700', color: '#111827', marginTop: 4 },
  priceRow: { flexDirection: 'row', alignItems: 'baseline', gap: 10, marginTop: 12, flexWrap: 'wrap' },
  price: { fontSize: 24, fontWeight: '700', color: '#111827' },
  compareAtPrice: { fontSize: 15, color: '#9ca3af', textDecorationLine: 'line-through' },
  savingsBadge: { backgroundColor: '#dcfce7', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2 },
  savingsText: { color: '#15803d', fontSize: 12, fontWeight: '600' },
  description: { fontSize: 14, color: '#4b5563', lineHeight: 21, marginTop: 12 },
  variantSection: { marginTop: 20 },
  stockRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 16 },
  stockDot: { width: 8, height: 8, borderRadius: 4 },
  stockText: { fontSize: 13, fontWeight: '600', color: '#111827' },
  stockTextOut: { color: '#dc2626' },
  actionRow: { flexDirection: 'row', alignItems: 'stretch', gap: 10, marginTop: 16 },
  qtyStepper: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#d1d5db', borderRadius: 10 },
  qtyButton: { paddingHorizontal: 12, paddingVertical: 10 },
  qtyButtonText: { fontSize: 16, fontWeight: '600', color: '#374151' },
  qtyValue: { width: 24, textAlign: 'center', fontSize: 14, fontWeight: '600', color: '#111827' },
  addButton: { flex: 1, backgroundColor: '#111827', borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  addButtonDisabled: { backgroundColor: '#e5e7eb' },
  addButtonText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  wishlistButton: { width: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 10, borderWidth: 1, borderColor: '#d1d5db' },
  wishlistButtonActive: { borderColor: '#b45309' },
  wishlistButtonText: { fontSize: 20, color: '#6b7280' },
  wishlistButtonTextActive: { color: '#b45309' },
  specSection: { marginTop: 28, borderTopWidth: 1, borderTopColor: '#e5e7eb', paddingTop: 16 },
  specHeading: { fontSize: 12, fontWeight: '700', color: '#9ca3af', textTransform: 'uppercase' },
  specGroup: { marginTop: 12 },
  specGroupLabel: { fontSize: 12, fontWeight: '600', color: '#4b5563', marginBottom: 6 },
  specList: { borderRadius: 10, overflow: 'hidden', borderWidth: 1, borderColor: '#e5e7eb' },
  specRow: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 9 },
  specRowAlt: { backgroundColor: '#f9fafb' },
  specKey: { fontSize: 13, color: '#6b7280', fontWeight: '500' },
  specValue: { fontSize: 13, color: '#111827' },
});
