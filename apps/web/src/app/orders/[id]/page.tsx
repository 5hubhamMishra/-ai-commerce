"use client";

import { use } from "react";
import Link from "next/link";
import { useStore } from "@/lib/store";
import { getProduct } from "@/lib/data";
import { formatPrice } from "@/lib/format";
import Image from "next/image";
import { RowsPageSkeleton } from "@/components/Skeleton";

const STAGES = ["confirmed", "processing", "shipped", "delivered"] as const;

const STAGE_LABELS: Record<string, string> = {
  confirmed: "Order confirmed",
  processing: "Being prepared",
  shipped: "On the way",
  delivered: "Delivered",
};

export default function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const order = useStore((s) => s.orders.find((o) => o.id === id));
  const hydrated = useStore((s) => s.hydrated);

  if (!hydrated) return <RowsPageSkeleton rows={1} />;

  if (!order) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-24 text-center">
        <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="var(--clr-border-strong)" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" className="mx-auto">
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.35-4.35" />
        </svg>
        <h1 className="font-display text-xl font-semibold mt-4" style={{ color: "var(--clr-text-primary)" }}>Order not found</h1>
        <p className="mt-2 text-sm" style={{ color: "var(--clr-text-secondary)" }}>We couldn&apos;t find order {id}.</p>
        <Link href="/orders" className="mt-5 btn btn-accent inline-flex">
          Back to orders
        </Link>
      </div>
    );
  }

  const stageIndex = STAGES.indexOf(
    order.status === "cancelled" ? "confirmed" : (order.status as typeof STAGES[number])
  );

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Breadcrumb */}
      <nav className="text-xs mb-6" style={{ color: "var(--clr-text-secondary)" }}>
        <Link href="/orders" className="hover:text-[var(--clr-accent)] transition-colors">Orders</Link>
        <span className="mx-1.5">›</span>
        <span style={{ color: "var(--clr-text-primary)" }}>{order.id}</span>
      </nav>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest" style={{ color: "var(--clr-text-disabled)" }}>Order</p>
          <h1 className="font-display text-2xl font-semibold mt-0.5" style={{ color: "var(--clr-text-primary)" }}>{order.id}</h1>
          <p className="text-sm mt-1" style={{ color: "var(--clr-text-secondary)" }}>
            Placed {new Date(order.placedAt).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}
          </p>
        </div>
        <span className="badge badge-success self-start">{order.status}</span>
      </div>

      {/* Progress tracker */}
      <div className="mt-8 rounded-2xl border p-6" style={{ borderColor: "var(--clr-border)", background: "var(--clr-surface)" }}>
        <h2 className="text-xs font-bold uppercase tracking-widest mb-5" style={{ color: "var(--clr-text-disabled)" }}>
          Order Progress
        </h2>
        <div className="relative flex items-start justify-between">
          {/* Progress line */}
          <div
            className="absolute top-3 left-0 right-0 h-0.5 -z-0"
            style={{ background: "var(--clr-border)" }}
          >
            <div
              className="h-full transition-all duration-700"
              style={{
                background: "var(--clr-accent)",
                width: `${(stageIndex / (STAGES.length - 1)) * 100}%`,
              }}
            />
          </div>
          {STAGES.map((stage, i) => {
            const done = i <= stageIndex;
            return (
              <div key={stage} className="relative z-10 flex flex-1 flex-col items-center gap-2">
                <div
                  className="flex h-6 w-6 items-center justify-center rounded-full border-2 transition-all duration-300 text-white text-xs font-bold"
                  style={{
                    background: done ? "var(--clr-accent)" : "var(--clr-surface)",
                    borderColor: done ? "var(--clr-accent)" : "var(--clr-border)",
                    color: done ? "white" : "var(--clr-text-disabled)",
                  }}
                >
                  {done ? (
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  ) : (i + 1)}
                </div>
                <p
                  className="text-center text-[10px] font-semibold capitalize leading-tight"
                  style={{ color: done ? "var(--clr-text-primary)" : "var(--clr-text-disabled)" }}
                >
                  {stage}
                </p>
                <p className="text-center text-[10px] hidden sm:block" style={{ color: "var(--clr-text-disabled)" }}>
                  {STAGE_LABELS[stage]}
                </p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Order items */}
      <div className="mt-6 rounded-2xl border overflow-hidden" style={{ borderColor: "var(--clr-border)", background: "var(--clr-surface)" }}>
        <div className="px-5 py-4 border-b" style={{ borderColor: "var(--clr-border)" }}>
          <h2 className="font-display text-lg font-semibold" style={{ color: "var(--clr-text-primary)" }}>
            Items ordered
          </h2>
        </div>
        <div className="divide-y" style={{ borderColor: "var(--clr-border)" }}>
          {order.items.map((item) => {
            // Real-cart-sourced orders carry their own name/image snapshot (real product
            // IDs aren't resolvable via the static getProduct()); legacy fake-catalog
            // orders fall back to looking the product up there, as before.
            const product = item.productName ? null : getProduct(item.productId);
            const name = item.productName ?? product?.name;
            const imageUrl = item.productName ? item.productImageUrl : product?.images[0];
            const brand = product?.brand;
            if (!name) return null;
            return (
              <div key={item.productId} className="flex items-center gap-4 px-5 py-4">
                <div className="relative h-14 w-14 shrink-0 rounded-xl overflow-hidden" style={{ background: "var(--clr-surface-2)" }}>
                  {imageUrl && <Image src={imageUrl} alt={name} fill className="object-cover" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium line-clamp-1" style={{ color: "var(--clr-text-primary)" }}>
                    {name}
                  </p>
                  <p className="text-xs mt-0.5" style={{ color: "var(--clr-text-disabled)" }}>
                    {brand ? `${brand} · ` : ""}Qty: {item.quantity}
                  </p>
                </div>
                <p className="text-sm font-bold shrink-0" style={{ color: "var(--clr-text-primary)" }}>
                  {formatPrice(item.priceAtPurchase * item.quantity)}
                </p>
              </div>
            );
          })}
        </div>
        <div
          className="flex justify-between items-center px-5 py-4 border-t"
          style={{ borderColor: "var(--clr-border)", background: "var(--clr-surface-2)" }}
        >
          <span className="font-semibold text-sm" style={{ color: "var(--clr-text-primary)" }}>Total</span>
          <span className="font-display text-xl font-bold" style={{ color: "var(--clr-text-primary)" }}>
            {formatPrice(order.total)}
          </span>
        </div>
      </div>

      {/* Shipping address */}
      <div className="mt-4 rounded-2xl border p-5" style={{ borderColor: "var(--clr-border)", background: "var(--clr-surface)" }}>
        <div className="flex items-center gap-2 mb-2">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--clr-accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
            <circle cx="12" cy="10" r="3" />
          </svg>
          <p className="text-xs font-bold uppercase tracking-widest" style={{ color: "var(--clr-text-disabled)" }}>Shipping to</p>
        </div>
        <p className="text-sm leading-relaxed" style={{ color: "var(--clr-text-primary)" }}>{order.address}</p>
      </div>

      {/* Back link */}
      <div className="mt-6">
        <Link href="/orders" className="text-sm font-medium transition-colors" style={{ color: "var(--clr-accent)" }}>
          ← Back to all orders
        </Link>
      </div>
    </div>
  );
}
