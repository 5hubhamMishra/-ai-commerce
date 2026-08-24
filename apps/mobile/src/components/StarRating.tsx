import { Pressable, StyleSheet, Text, View } from 'react-native';

const STAR_FILLED = '★';
const STAR_EMPTY = '☆';

/** Read-only display (no onChange) or an interactive 1-5 picker (onChange supplied).
 *  Ported from apps/web's StarRating.tsx — same value/label contract, RN shell. */
export default function StarRating({
  value,
  onChange,
  size = 16,
  label,
}: {
  value: number;
  onChange?: (rating: number) => void;
  size?: number;
  label?: string;
}) {
  const stars = [1, 2, 3, 4, 5];
  const rounded = Math.round(value);

  if (!onChange) {
    return (
      <View
        style={styles.row}
        accessibilityRole="image"
        accessibilityLabel={`${value.toFixed(1)} out of 5 stars`}
      >
        {stars.map((n) => (
          <Text key={n} style={[styles.star, { fontSize: size, color: n <= rounded ? '#b45309' : '#d1d5db' }]}>
            {n <= rounded ? STAR_FILLED : STAR_EMPTY}
          </Text>
        ))}
      </View>
    );
  }

  return (
    <View>
      {label && <Text style={styles.label}>{label}</Text>}
      <View style={styles.row} accessibilityRole="radiogroup">
        {stars.map((n) => (
          <Pressable
            key={n}
            onPress={() => onChange(n)}
            accessibilityRole="radio"
            accessibilityLabel={`${n} star${n === 1 ? '' : 's'}`}
            accessibilityState={{ selected: n === rounded }}
            hitSlop={6}
          >
            <Text style={[styles.star, { fontSize: size + 4, color: n <= rounded ? '#b45309' : '#d1d5db' }]}>
              {n <= rounded ? STAR_FILLED : STAR_EMPTY}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 2 },
  star: { fontWeight: '600' },
  label: { fontSize: 11, fontWeight: '700', color: '#9ca3af', textTransform: 'uppercase', marginBottom: 6 },
});
