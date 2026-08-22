import CatalogProductCard, { type CatalogCardProduct } from "./CatalogProductCard";

export default function CatalogProductGrid({ products }: { products: CatalogCardProduct[] }) {
  if (!products || products.length === 0) {
    return (
      <div className="py-20 px-8 flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-[var(--clr-border)] mt-2">
        <svg
          viewBox="0 0 24 24"
          width="64"
          height="64"
          fill="none"
          stroke="var(--clr-border-strong)"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
          <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
          <line x1="12" y1="22.08" x2="12" y2="12" />
        </svg>
        <h3 className="font-display text-lg text-[var(--clr-text-primary)]">No products found</h3>
        <p className="text-sm text-[var(--clr-text-secondary)] text-center">
          Try adjusting your filters or search terms
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
      {products.map((product) => (
        <CatalogProductCard key={product.id} product={product} />
      ))}
    </div>
  );
}
