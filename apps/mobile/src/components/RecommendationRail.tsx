import { FlatList, StyleSheet, Text, View } from 'react-native';
import type { ProductListItem } from '@ai-commerce/types';
import ProductCard from './ProductCard';

type Props = {
  title: string;
  products: ProductListItem[];
  onPressProduct: (product: ProductListItem) => void;
};

export default function RecommendationRail({ title, products, onPressProduct }: Props) {
  if (products.length === 0) return null;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{title}</Text>
      <FlatList
        horizontal
        showsHorizontalScrollIndicator={false}
        data={products}
        keyExtractor={(p) => p.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <View style={styles.cardWrap}>
            <ProductCard product={item} onPress={() => onPressProduct(item)} />
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginTop: 16 },
  title: { fontSize: 13, fontWeight: '700', color: '#111827', marginBottom: 8, marginHorizontal: 12 },
  list: { paddingHorizontal: 6 },
  cardWrap: { width: 150 },
});
