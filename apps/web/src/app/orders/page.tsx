"use client";

import { startTransition, useEffect, useState } from "react";
import Link from "next/link";
import type { ListOrdersResponse } from "@ai-commerce/types";
import { ordersApi } from "@ai-commerce/api-client";
import { formatPrice } from "@/lib/format";
import { ORDER_STATUS_BADGE, ORDER_STATUS_LABELS } from "@/lib/order-status";
import { RowsPageSkeleton } from "@/components/Skeleton";
import { useStore } from "@/lib/store";

const PAGE_SIZE = 20;

export default function OrdersPage() {
  const authStatus = useStore((s) => s.authStatus);
  const userId = useStore((s) => s.user?.id ?? null);
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<ListOrdersResponse | null>(null);
  const [loading, setLoading] = useState(authStatus !== "unauthenticated");

  useEffect(() => {
    if (authStatus !== "authenticated" || !userId) {
      startTransition(() => {
        setResult(null);
        setLoading(authStatus === "checking" || authStatus === "idle");
      });
      return;
    }

    let cancelled = false;
    startTransition(() => {
      setResult(null);
      setLoading(true);
    });
    ordersApi
      .list({ page, pageSize: PAGE_SIZE })
      .then((res) => {
        if (!cancelled) setResult(res);
      })
      .catch(() => {
        if (!cancelled) setResult(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [authStatus, page, userId]);

  if (authStatus === "idle" || authStatus === "checking") {
    return <RowsPageSkeleton />;
  }

  if (authStatus !== "authenticated") {
    return (
      <div className="mx-auto max-w-4xl px-4 py-16 sm:px-6 lg:px-8">
        <div className="empty-state flex flex-col items-center">
          <h1 className="font-display text-2xl font-semibold">Your orders</h1>
          <p className="mt-2 max-w-xs text-center text-sm" style={{ color: "var(--clr-text-secondary)" }}>
            Sign in to see your order history.
          </p>
          <Link href="/login?redirect=/orders" className="mt-5 btn btn-accent">
            Sign in
          </Link>
        </div>
      </div>
    );
  }

  if (loading && !result) return <RowsPageSkeleton />;

  const orders = result?.items ?? [];
  const totalPages = result ? Math.max(1, Math.ceil(result.total / result.pageSize)) : 1;

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
        <>
          <div className="mt-6 space-y-3">
            {orders.map((o) => (
              <Link
                key={o.id}
                href={`/orders/${o.id}`}
                className="rounded-2xl border border-[var(--clr-border)] bg-[var(--clr-surface)] p-5 flex items-center justify-between hover:border-[var(--clr-border-strong)] hover:shadow-sm transition-all duration-150 block"
              >
                <div className="flex flex-col gap-1">
                  <p className="text-xs font-bold uppercase tracking-widest text-[var(--clr-text-disabled)]">{o.id.slice(0, 8)}</p>
                  <p className="text-sm font-semibold text-[var(--clr-text-primary)]">
                    {new Date(o.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                  </p>
                  <p className="text-xs text-[var(--clr-text-secondary)]">
                    {o.itemCount} item{o.itemCount > 1 ? "s" : ""}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1.5 flex-1 pl-4">
                  <div className="flex items-center gap-2">
                    <p className="text-lg font-bold font-display">{formatPrice(o.total)}</p>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--clr-text-disabled)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="9 18 15 12 9 6"></polyline>
                    </svg>
                  </div>
                  <span className={`badge badge-${ORDER_STATUS_BADGE[o.status]}`}>
                    {ORDER_STATUS_LABELS[o.status]}
                  </span>
                </div>
              </Link>
            ))}
          </div>
          {totalPages > 1 && (
            <div className="mt-8 flex items-center justify-center gap-3">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="rounded-xl border border-[var(--clr-border)] px-4 py-2 text-sm font-medium disabled:opacity-40"
              >
                Previous
              </button>
              <span className="text-sm text-[var(--clr-text-secondary)]">Page {page} of {totalPages}</span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="rounded-xl border border-[var(--clr-border)] px-4 py-2 text-sm font-medium disabled:opacity-40"
              >
                Next
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
