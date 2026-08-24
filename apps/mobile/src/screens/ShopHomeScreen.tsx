import { startTransition, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { Category, ProductListItem, ProductSort } from '@ai-commerce/types';
import { catalogApi } from '@ai-commerce/api-client';
import ProductCard from '../components/ProductCard';
import RecommendationRail from '../components/RecommendationRail';
import { useRecommendations } from '../lib/useRecommendations';
import type { ShopStackParamList } from '../navigation/types';

const PAGE_SIZE = 20;
const SORTS: { value: ProductSort; label: string }[] = [
  { value: 'newest', label: 'Newest' },
  { value: 'name_asc', label: 'Name' },
  { value: 'featured', label: 'Featured' },
];

type Props = NativeStackScreenProps<ShopStackParamList, 'ShopHome'>;

export default function ShopHomeScreen({ navigation }: Props) {
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [categorySlug, setCategorySlug] = useState<string | undefined>(undefined);
  const [sort, setSort] = useState<ProductSort>('newest');

  const [categories, setCategories] = useState<Category[]>([]);
  const [items, setItems] = useState<ProductListItem[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    catalogApi
      .listCategories()
      .then(setCategories)
      .catch(() => setCategories([]));
  }, []);

  // Re-fetch page 1 whenever a filter changes; append subsequent pages on infinite scroll.
  useEffect(() => {
    let cancelled = false;
    startTransition(() => {
      if (page === 1) setLoading(true);
      else setLoadingMore(true);
      setError(null);
    });
    catalogApi
      .listProducts({ page, pageSize: PAGE_SIZE, search: search || undefined, category: categorySlug, sort })
      .then((res) => {
        if (cancelled) return;
        setItems((prev) => (page === 1 ? res.items : [...prev, ...res.items]));
        setTotal(res.total);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load products.');
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
  }, [page, search, categorySlug, sort]);

  function applyFilters(next: { search?: string; category?: string | undefined; sort?: ProductSort }) {
    if (next.search !== undefined) setSearch(next.search);
    if ('category' in next) setCategorySlug(next.category);
    if (next.sort !== undefined) setSort(next.sort);
    setPage(1);
  }

  // Only shown on the default, unfiltered browse view — "recommended for you" is semantically
  // nonsensical layered on top of a search/category result set, and the screen has no
  // scrollable wrapper above the grid to tuck it away in otherwise.
  const recommended = useRecommendations('personalized', { limit: 10, enabled: !search && !categorySlug });

  return (
    <View style={styles.container}>
      <View style={styles.searchRow}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search products..."
          value={searchInput}
          onChangeText={setSearchInput}
          onSubmitEditing={() => applyFilters({ search: searchInput.trim() })}
          returnKeyType="search"
          autoCapitalize="none"
          accessibilityLabel="Search products"
        />
      </View>

      {recommended && (
        <RecommendationRail
          title="Recommended for you"
          products={recommended.map((r) => r.product)}
          onPressProduct={(p) => navigation.navigate('ProductDetail', { slug: p.slug })}
        />
      )}

      <FlatList
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.chipRow}
        data={categories}
        keyExtractor={(c) => c.id}
        ListHeaderComponent={
          <Chip label="All" selected={!categorySlug} onPress={() => applyFilters({ category: undefined })} />
        }
        renderItem={({ item }) => (
          <Chip
            label={item.name}
            selected={categorySlug === item.slug}
            onPress={() => applyFilters({ category: item.slug })}
          />
        )}
      />

      <View style={styles.sortRow}>
        {SORTS.map((s) => (
          <Chip key={s.value} label={s.label} selected={sort === s.value} onPress={() => applyFilters({ sort: s.value })} />
        ))}
      </View>

      {loading ? (
        <ActivityIndicator style={styles.centerSpinner} />
      ) : error ? (
        <View style={styles.centerMessage}>
          <Text style={styles.errorText} accessibilityRole="alert">
            {error}
          </Text>
        </View>
      ) : items.length === 0 ? (
        <View style={styles.centerMessage}>
          <Text style={styles.emptyText}>No products found.</Text>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(p) => p.id}
          numColumns={2}
          contentContainerStyle={styles.grid}
          renderItem={({ item }) => (
            <ProductCard product={item} onPress={() => navigation.navigate('ProductDetail', { slug: item.slug })} />
          )}
          onEndReachedThreshold={0.5}
          onEndReached={() => {
            if (!loadingMore && items.length < total) setPage((p) => p + 1);
          }}
          ListFooterComponent={loadingMore ? <ActivityIndicator style={styles.footerSpinner} /> : null}
        />
      )}
    </View>
  );
}

function Chip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable
      style={[styles.chip, selected && styles.chipSelected]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={label}
    >
      <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  searchRow: { paddingHorizontal: 12, paddingTop: 12 },
  searchInput: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
  },
  chipRow: { marginTop: 12, paddingLeft: 12 },
  sortRow: { flexDirection: 'row', paddingHorizontal: 12, marginTop: 8, gap: 8 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#d1d5db',
    marginRight: 8,
  },
  chipSelected: { backgroundColor: '#b45309', borderColor: '#b45309' },
  chipText: { fontSize: 13, color: '#374151' },
  chipTextSelected: { color: '#fff', fontWeight: '600' },
  grid: { padding: 6 },
  centerSpinner: { marginTop: 40 },
  centerMessage: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  errorText: { color: '#dc2626', textAlign: 'center' },
  emptyText: { color: '#6b7280' },
  footerSpinner: { marginVertical: 16 },
});
