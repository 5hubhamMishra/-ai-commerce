"use client";

import type { Brand, Category } from "@ai-commerce/types";

export type FilterState = {
  category?: string;
  brand?: string;
  maxPrice?: number;
  sort: "newest" | "name_asc" | "featured";
};

export default function Filters({
  state,
  onChange,
  categories,
  brands,
}: {
  state: FilterState;
  onChange: (next: FilterState) => void;
  categories: Category[];
  brands: Brand[];
}) {
  const hasActive = !!(state.category || state.brand || (state.maxPrice && state.maxPrice < 200000));

  const sortOptions: { id: FilterState["sort"]; label: string }[] = [
    { id: "newest", label: "Newest" },
    { id: "name_asc", label: "Name A–Z" },
    { id: "featured", label: "Featured" },
  ];

  return (
    <div className="space-y-7">
      {/* Clear all */}
      {hasActive && (
        <div className="flex justify-end -mb-3">
          <button
            onClick={() => onChange({ sort: state.sort })}
            className="text-xs font-medium hover:underline"
            style={{ color: "var(--clr-error)" }}
          >
            Clear all filters
          </button>
        </div>
      )}

      {/* Category */}
      <div>
        <h4 className="text-[10px] font-bold uppercase tracking-widest mb-3" style={{ color: "var(--clr-text-disabled)" }}>
          Category
        </h4>
        <div className="space-y-1">
          <PillButton
            label="All categories"
            active={!state.category}
            onClick={() => onChange({ ...state, category: undefined })}
          />
          {categories.map((c) => (
            <PillButton
              key={c.slug}
              label={c.name}
              active={state.category === c.slug}
              onClick={() => onChange({ ...state, category: c.slug })}
            />
          ))}
        </div>
      </div>

      {/* Brand */}
      <div>
        <h4 className="text-[10px] font-bold uppercase tracking-widest mb-3" style={{ color: "var(--clr-text-disabled)" }}>
          Brand
        </h4>
        <div className="space-y-1 max-h-44 overflow-y-auto pr-1">
          <PillButton
            label="All brands"
            active={!state.brand}
            onClick={() => onChange({ ...state, brand: undefined })}
          />
          {brands.map((b) => (
            <PillButton
              key={b.slug}
              label={b.name}
              active={state.brand === b.slug}
              onClick={() => onChange({ ...state, brand: b.slug })}
            />
          ))}
        </div>
      </div>

      {/* Max price */}
      <div>
        <label htmlFor="max-price-filter" className="block text-[10px] font-bold uppercase tracking-widest mb-3" style={{ color: "var(--clr-text-disabled)" }}>
          Max price
        </label>
        <input
          id="max-price-filter"
          type="range"
          min={500}
          max={200000}
          step={500}
          value={state.maxPrice ?? 200000}
          onChange={(e) => onChange({ ...state, maxPrice: Number(e.target.value) })}
          aria-valuetext={`Up to ₹${(state.maxPrice ?? 200000).toLocaleString("en-IN")}`}
          className="w-full h-1.5 rounded-full appearance-none cursor-pointer"
          style={{ accentColor: "var(--clr-accent)" }}
        />
        <div className="mt-2.5 flex items-center gap-2">
          <span className="text-xs" style={{ color: "var(--clr-text-secondary)" }}>Up to</span>
          <span
            className="px-2 py-1 text-xs font-bold rounded-lg text-white"
            style={{ background: "var(--clr-ink)" }}
          >
            ₹{(state.maxPrice ?? 200000).toLocaleString("en-IN")}
          </span>
        </div>
      </div>

      {/* Sort */}
      <div>
        <h4 className="text-[10px] font-bold uppercase tracking-widest mb-3" style={{ color: "var(--clr-text-disabled)" }}>
          Sort by
        </h4>
        <div className="grid grid-cols-2 gap-2">
          {sortOptions.map((opt) => {
            const active = state.sort === opt.id;
            return (
              <button
                key={opt.id}
                onClick={() => onChange({ ...state, sort: opt.id })}
                className="text-xs font-semibold px-2.5 py-2 rounded-xl border transition-all duration-150"
                style={{
                  background: active ? "var(--clr-ink)" : "transparent",
                  color: active ? "white" : "var(--clr-text-secondary)",
                  borderColor: active ? "transparent" : "var(--clr-border)",
                }}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function PillButton({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center justify-between text-left text-sm px-3 py-2 rounded-xl transition-all duration-150"
      style={{
        background: active ? "var(--clr-accent-subtle)" : "transparent",
        color: active ? "var(--clr-accent-text)" : "var(--clr-text-secondary)",
        fontWeight: active ? 600 : 400,
      }}
    >
      {label}
      {active && (
        <span
          className="w-2 h-2 rounded-full flex-shrink-0"
          style={{ background: "var(--clr-accent)" }}
        />
      )}
    </button>
  );
}
