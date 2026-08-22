"use client";

import { useEffect, useMemo, useState } from "react";
import type { ProductVariant } from "@ai-commerce/types";

/** Resolves a selection across a product's variant attributes (e.g. Color, Size) to one
 *  purchasable variant. Every seed product currently ships exactly one variant, so this
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

  // The single-variant case has nothing to choose — its attributes are pure derived state
  // from `activeVariants`, not something that needs an effect to synchronize. Only a real
  // user click (the multi-variant case) needs to go through `selection` state.
  const effectiveSelection = useMemo(() => {
    if (activeVariants.length === 1 && Object.keys(selection).length === 0) {
      const only = activeVariants[0];
      const derived: Record<string, string> = {};
      for (const attr of only.attributes) derived[attr.attributeSlug] = attr.valueSlug;
      return derived;
    }
    return selection;
  }, [activeVariants, selection]);

  const resolvedVariant = useMemo(() => {
    if (Object.keys(effectiveSelection).length === 0) return null;
    return (
      activeVariants.find(
        (v) =>
          v.attributes.length === Object.keys(effectiveSelection).length &&
          v.attributes.every((attr) => effectiveSelection[attr.attributeSlug] === attr.valueSlug),
      ) ?? null
    );
  }, [activeVariants, effectiveSelection]);

  useEffect(() => {
    onSelect(resolvedVariant);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolvedVariant]);

  if (activeVariants.length === 0) return null;

  if (activeVariants.length === 1) {
    const only = activeVariants[0];
    if (only.attributes.length === 0) return null;
    return (
      <div className="flex flex-wrap gap-2">
        {only.attributes.map((attr) => (
          <span key={attr.attributeSlug} className="badge badge-subtle">
            {attr.attribute}: {attr.value}
          </span>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {[...attributeGroups.entries()].map(([attributeSlug, group]) => (
        <div key={attributeSlug}>
          <h4
            className="text-[10px] font-bold uppercase tracking-widest mb-2"
            style={{ color: "var(--clr-text-disabled)" }}
          >
            {group.label}
          </h4>
          <div className="flex flex-wrap gap-2">
            {[...group.values.entries()].map(([valueSlug, label]) => {
              const active = selection[attributeSlug] === valueSlug;
              return (
                <button
                  key={valueSlug}
                  type="button"
                  onClick={() => setSelection((prev) => ({ ...prev, [attributeSlug]: valueSlug }))}
                  className="text-xs font-semibold px-3 py-2 rounded-xl border transition-all duration-150"
                  style={{
                    background: active ? "var(--clr-ink)" : "transparent",
                    color: active ? "white" : "var(--clr-text-secondary)",
                    borderColor: active ? "transparent" : "var(--clr-border)",
                  }}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
