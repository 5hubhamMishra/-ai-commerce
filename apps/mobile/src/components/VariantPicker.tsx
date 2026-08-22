import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { ProductVariant } from '@ai-commerce/types';

/** Resolves a selection across a product's variant attributes (e.g. Color, Size) to one
 *  purchasable variant. Ported from apps/web's VariantPicker.tsx — same resolution logic,
 *  React Native shell. Every seed product currently ships exactly one variant, so this
 *  auto-selects it and renders as an inert attribute summary rather than a real picker. */
export default function VariantPicker({
  variants,
  onSelect,
}: {
  variants: ProductVariant[];
  onSelect: (variant: ProductVariant | null) => void;
}) {
  const activeVariants = useMemo(() => variants.filter((v) => v.isActive), [variants]);

  const attributeGroups = useMemo(() => {
    const groups = new Map<string, { label: string; values: Map<string, string> }>();
    for (const variant of activeVariants) {
      for (const attr of variant.attributes) {
        if (!groups.has(attr.attributeSlug)) {
          groups.set(attr.attributeSlug, { label: attr.attribute, values: new Map() });
        }
        groups.get(attr.attributeSlug)!.values.set(attr.valueSlug, attr.value);
      }
    }
    return groups;
  }, [activeVariants]);

  const [selection, setSelection] = useState<Record<string, string>>({});

  // A lone active variant is always the resolved one, whether or not it carries attributes —
  // there's nothing to pick, so it must not wait on `selection` being populated (a single
  // variant with zero attributes would otherwise leave `selection` permanently empty and
  // resolvedVariant permanently null, disabling Add to Cart with no way to recover).
  const resolvedVariant = useMemo(() => {
    if (activeVariants.length === 1) return activeVariants[0];
    if (Object.keys(selection).length === 0) return null;
    return (
      activeVariants.find(
        (v) =>
          v.attributes.length === Object.keys(selection).length &&
          v.attributes.every((attr) => selection[attr.attributeSlug] === attr.valueSlug),
      ) ?? null
    );
  }, [activeVariants, selection]);

  useEffect(() => {
    onSelect(resolvedVariant);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolvedVariant]);

  if (activeVariants.length === 0) return null;

  if (activeVariants.length === 1) {
    const only = activeVariants[0];
    if (only.attributes.length === 0) return null;
    return (
      <View style={styles.badgeRow}>
        {only.attributes.map((attr) => (
          <View key={attr.attributeSlug} style={styles.badge}>
            <Text style={styles.badgeText}>
              {attr.attribute}: {attr.value}
            </Text>
          </View>
        ))}
      </View>
    );
  }

  return (
    <View style={styles.groups}>
      {[...attributeGroups.entries()].map(([attributeSlug, group]) => (
        <View key={attributeSlug}>
          <Text style={styles.groupLabel}>{group.label}</Text>
          <View style={styles.optionRow}>
            {[...group.values.entries()].map(([valueSlug, label]) => {
              const active = selection[attributeSlug] === valueSlug;
              return (
                <Pressable
                  key={valueSlug}
                  onPress={() => setSelection((prev) => ({ ...prev, [attributeSlug]: valueSlug }))}
                  style={[styles.option, active && styles.optionActive]}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  accessibilityLabel={`${group.label}: ${label}`}
                >
                  <Text style={[styles.optionText, active && styles.optionTextActive]}>{label}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  badge: { backgroundColor: '#f3f4f6', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4 },
  badgeText: { fontSize: 12, color: '#374151' },
  groups: { gap: 16 },
  groupLabel: { fontSize: 10, fontWeight: '700', color: '#9ca3af', textTransform: 'uppercase', marginBottom: 8 },
  optionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  option: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#d1d5db',
  },
  optionActive: { backgroundColor: '#111827', borderColor: '#111827' },
  optionText: { fontSize: 13, fontWeight: '600', color: '#374151' },
  optionTextActive: { color: '#fff' },
});
