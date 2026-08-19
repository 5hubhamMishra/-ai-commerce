"use client";

import Link from "next/link";
import { useStore } from "@/lib/store";
import { formatPrice } from "@/lib/format";
import { RowsPageSkeleton } from "@/components/Skeleton";

export default function OrdersPage() {
  const orders = useStore((s) => s.orders);
  const hydrated = useStore((s) => s.hydrated);

  if (!hydrated) return <RowsPageSkeleton />;

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
      <h1 className="font-display text-2xl font-semibold mb-6">Your orders</h1>
      
      {orders.length === 0 ? (
        <div className="empty-state py-16 flex flex-col items-center">
          <svg width="72" height="72" viewBox="0 0 24 24" fill="none" stroke="var(--clr-border-strong)" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path>
            <polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline>
            <line x1="12" y1="22.08" x2="12" y2="12"></line>
          </svg>
          <h2 className="font-display text-xl font-semibold mt-4">No orders yet</h2>
          <p className="text-sm mt-2 max-w-xs text-center" style={{ color: 'var(--clr-text-secondary)' }}>Looks like you haven&apos;t made any purchases yet.</p>
          <Link href="/shop" className="mt-5 btn btn-accent">Start shopping</Link>
        </div>
      ) : (
        <div className="mt-6 space-y-3">
          {orders.map((o) => (
            <Link
              key={o.id}
              href={`/orders/${o.id}`}
              className="rounded-2xl border border-[var(--clr-border)] bg-[var(--clr-surface)] p-5 flex items-center justify-between hover:border-[var(--clr-border-strong)] hover:shadow-sm transition-all duration-150 block"
            >
              <div className="flex flex-col gap-1">
                <p className="text-xs font-bold uppercase tracking-widest text-[var(--clr-text-disabled)]">{o.id}</p>
                <p className="text-sm font-semibold text-[var(--clr-text-primary)]">
                  {new Date(o.placedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                </p>
                <p className="text-xs text-[var(--clr-text-secondary)]">
                  {o.items.length} item{o.items.length > 1 ? "s" : ""}
                </p>
              </div>
              <div className="flex flex-col items-end gap-1.5 flex-1 pl-4">
                <div className="flex items-center gap-2">
                  <p className="text-lg font-bold font-display">{formatPrice(o.total)}</p>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--clr-text-disabled)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="9 18 15 12 9 6"></polyline>
                  </svg>
                </div>
                <span className={`badge ${o.status === 'confirmed' || o.status === 'delivered' ? 'badge-success' : 'badge-warning'}`}>
                  {o.status}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
