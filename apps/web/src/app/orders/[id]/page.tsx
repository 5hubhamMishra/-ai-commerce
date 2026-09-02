"use client";

import { startTransition, use, useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { OrderDetail } from "@ai-commerce/types";
import { ordersApi } from "@ai-commerce/api-client";
import { formatPrice } from "@/lib/format";
import {
  ORDER_PROGRESS_STAGES,
  ORDER_STATUS_BADGE,
  ORDER_STATUS_LABELS,
  isCancellable,
  isOnHappyPath,
  progressStageIndex,
} from "@/lib/order-status";
import { RowsPageSkeleton } from "@/components/Skeleton";
import WriteReviewAction from "@/components/product/WriteReviewAction";
import { useStore } from "@/lib/store";

export default function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const authStatus = useStore((s) => s.authStatus);
  const userId = useStore((s) => s.user?.id ?? null);
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const orderOperation = useRef(0);
  const cancelOperation = useRef(0);

  useEffect(() => {
    if (authStatus !== "authenticated" || !userId) {
      startTransition(() => {
        setOrder(null);
        setLoading(authStatus === "idle" || authStatus === "checking");
        setCancelling(false);
        setCancelError(null);
      });
      orderOperation.current++;
      cancelOperation.current++;
      return;
    }
    const operation = ++orderOperation.current;
    cancelOperation.current++;
    let cancelled = false;
    startTransition(() => {
      setLoading(true);
      setCancelling(false);
      setCancelError(null);
    });
    ordersApi
      .get(id)
      .then((res) => {
        if (!cancelled && operation === orderOperation.current) setOrder(res);
      })
      .catch(() => {
        if (!cancelled && operation === orderOperation.current) setOrder(null);
      })
      .finally(() => {
        if (!cancelled && operation === orderOperation.current) setLoading(false);
      });
    return () => {
      cancelled = true;
      orderOperation.current++;
      cancelOperation.current++;
    };
  }, [authStatus, id, userId]);

  async function onCancel() {
    const order = orderOperation.current;
    const operation = ++cancelOperation.current;
    setCancelError(null);
    setCancelling(true);
    try {
      const updated = await ordersApi.cancel(id);
      if (order === orderOperation.current && operation === cancelOperation.current) {
        setOrder(updated);
      }
    } catch (err) {
      if (order === orderOperation.current && operation === cancelOperation.current) {
        setCancelError(err instanceof Error ? err.message : "Couldn't cancel this order.");
      }
    } finally {
      if (order === orderOperation.current && operation === cancelOperation.current) {
        setCancelling(false);
      }
    }
  }

  if (authStatus === "idle" || authStatus === "checking" || loading) {
    return <RowsPageSkeleton rows={1} />;
  }

  if (authStatus !== "authenticated") {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 text-center">
        <h1 className="font-display text-2xl font-semibold">Your order</h1>
        <p className="mt-2 text-sm text-[var(--clr-text-secondary)]">Sign in to view this order.</p>
        <Link href={`/login?redirect=${encodeURIComponent(`/orders/${id}`)}`} className="mt-5 btn btn-accent inline-flex">
          Sign in
        </Link>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-24 text-center">
        <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="var(--clr-border-strong)" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" className="mx-auto">
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.35-4.35" />
        </svg>
        <h1 className="font-display text-xl font-semibold mt-4" style={{ color: "var(--clr-text-primary)" }}>Order not found</h1>
        <p className="mt-2 text-sm" style={{ color: "var(--clr-text-secondary)" }}>We couldn&apos;t find that order.</p>
        <Link href="/orders" className="mt-5 btn btn-accent inline-flex">
          Back to orders
        </Link>
      </div>
    );
  }

  const onHappyPath = isOnHappyPath(order.status);
  const stageIndex = onHappyPath ? Math.max(0, progressStageIndex(order.status)) : -1;

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Breadcrumb */}
      <nav className="text-xs mb-6" style={{ color: "var(--clr-text-secondary)" }}>
        <Link href="/orders" className="hover:text-[var(--clr-accent)] transition-colors">Orders</Link>
        <span className="mx-1.5">›</span>
        <span style={{ color: "var(--clr-text-primary)" }}>{order.id.slice(0, 8)}</span>
      </nav>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest" style={{ color: "var(--clr-text-disabled)" }}>Order</p>
          <h1 className="font-display text-2xl font-semibold mt-0.5 break-all" style={{ color: "var(--clr-text-primary)" }}>{order.id}</h1>
          <p className="text-sm mt-1" style={{ color: "var(--clr-text-secondary)" }}>
            Placed {new Date(order.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}
          </p>
        </div>
        <span className={`badge badge-${ORDER_STATUS_BADGE[order.status]} self-start`}>{ORDER_STATUS_LABELS[order.status]}</span>
      </div>

      {order.cancelReason && (
        <p className="mt-3 text-sm" style={{ color: "var(--clr-text-secondary)" }}>Cancellation reason: {order.cancelReason}</p>
      )}

      {/* Progress tracker */}
      {onHappyPath && (
        <div className="mt-8 rounded-2xl border p-6" style={{ borderColor: "var(--clr-border)", background: "var(--clr-surface)" }}>
          <h2 className="text-xs font-bold uppercase tracking-widest mb-5" style={{ color: "var(--clr-text-disabled)" }}>
            Order Progress
          </h2>
          <div className="relative flex items-start justify-between">
            <div className="absolute top-3 left-0 right-0 h-0.5 -z-0" style={{ background: "var(--clr-border)" }}>
              <div
                className="h-full transition-all duration-700"
                style={{
                  background: "var(--clr-accent)",
                  width: `${(stageIndex / (ORDER_PROGRESS_STAGES.length - 1)) * 100}%`,
                }}
              />
            </div>
            {ORDER_PROGRESS_STAGES.map((stage, i) => {
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
                    className="text-center text-[10px] font-semibold leading-tight"
                    style={{ color: done ? "var(--clr-text-primary)" : "var(--clr-text-disabled)" }}
                  >
                    {ORDER_STATUS_LABELS[stage]}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Order items */}
      <div className="mt-6 rounded-2xl border overflow-hidden" style={{ borderColor: "var(--clr-border)", background: "var(--clr-surface)" }}>
        <div className="px-5 py-4 border-b" style={{ borderColor: "var(--clr-border)" }}>
          <h2 className="font-display text-lg font-semibold" style={{ color: "var(--clr-text-primary)" }}>
            Items ordered
          </h2>
        </div>
        <div className="divide-y" style={{ borderColor: "var(--clr-border)" }}>
          {order.items.map((item) => (
            <div key={item.id} className="flex flex-wrap items-start gap-4 px-5 py-4">
              <div
                className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl"
                style={{ background: "var(--clr-surface-2)" }}
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--clr-text-disabled)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" />
                  <line x1="3" y1="6" x2="21" y2="6" />
                  <path d="M16 10a4 4 0 0 1-8 0" />
                </svg>
              </div>
              <div className="flex-1 min-w-[10rem]">
                <p className="text-sm font-medium line-clamp-1" style={{ color: "var(--clr-text-primary)" }}>
                  {item.productName}
                </p>
                <p className="text-xs mt-0.5" style={{ color: "var(--clr-text-disabled)" }}>
                  {item.sku} · Qty: {item.quantity}
                </p>
                {order.status === "DELIVERED" && (
                  <div className="mt-1.5">
                    <WriteReviewAction
                      orderId={order.id}
                      productSlug={item.productSlug}
                      productName={item.productName}
                    />
                  </div>
                )}
              </div>
              <p className="text-sm font-bold shrink-0" style={{ color: "var(--clr-text-primary)" }}>
                {formatPrice(item.lineTotal)}
              </p>
            </div>
          ))}
        </div>
        <div className="px-5 py-4 border-t space-y-1.5 text-sm" style={{ borderColor: "var(--clr-border)", background: "var(--clr-surface-2)" }}>
          <div className="flex justify-between" style={{ color: "var(--clr-text-secondary)" }}>
            <span>Subtotal</span>
            <span>{formatPrice(order.subtotal)}</span>
          </div>
          <div className="flex justify-between" style={{ color: "var(--clr-text-secondary)" }}>
            <span>Shipping ({order.shippingMethod})</span>
            <span>{order.shippingFee === 0 ? "Free" : formatPrice(order.shippingFee)}</span>
          </div>
          {order.discountTotal > 0 && (
            <div className="flex justify-between" style={{ color: "var(--clr-text-secondary)" }}>
              <span>Discount</span>
              <span>-{formatPrice(order.discountTotal)}</span>
            </div>
          )}
          {order.taxTotal > 0 && (
            <div className="flex justify-between" style={{ color: "var(--clr-text-secondary)" }}>
              <span>Tax</span>
              <span>{formatPrice(order.taxTotal)}</span>
            </div>
          )}
          <div className="flex justify-between items-center pt-1.5 font-semibold" style={{ color: "var(--clr-text-primary)" }}>
            <span>Total</span>
            <span className="font-display text-lg font-bold">{formatPrice(order.total)}</span>
          </div>
        </div>
      </div>

      {/* Shipment tracking */}
      {order.shipment && (
        <div className="mt-4 rounded-2xl border p-5" style={{ borderColor: "var(--clr-border)", background: "var(--clr-surface)" }}>
          <p className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color: "var(--clr-text-disabled)" }}>Shipment</p>
          <p className="text-sm" style={{ color: "var(--clr-text-primary)" }}>
            {order.shipment.carrier ?? "Carrier not yet assigned"}
            {order.shipment.trackingNumber ? ` · ${order.shipment.trackingNumber}` : ""}
          </p>
          {order.shipment.events.length > 0 && (
            <ul className="mt-3 space-y-2">
              {order.shipment.events.map((e, i) => (
                <li key={i} className="text-xs flex justify-between" style={{ color: "var(--clr-text-secondary)" }}>
                  <span>{e.status.replaceAll("_", " ")}{e.location ? ` — ${e.location}` : ""}</span>
                  <span>{new Date(e.occurredAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Shipping address */}
      <div className="mt-4 rounded-2xl border p-5" style={{ borderColor: "var(--clr-border)", background: "var(--clr-surface)" }}>
        <div className="flex items-center gap-2 mb-2">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--clr-accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
            <circle cx="12" cy="10" r="3" />
          </svg>
          <p className="text-xs font-bold uppercase tracking-widest" style={{ color: "var(--clr-text-disabled)" }}>Shipping to</p>
        </div>
        <p className="text-sm leading-relaxed" style={{ color: "var(--clr-text-primary)" }}>
          {order.address.line1}{order.address.line2 ? `, ${order.address.line2}` : ""}, {order.address.city}, {order.address.state} {order.address.postalCode}, {order.address.country}
        </p>
      </div>

      {cancelError && (
        <p role="alert" className="mt-4 text-sm" style={{ color: "var(--clr-error, #dc2626)" }}>
          {cancelError}
        </p>
      )}

      {/* Actions */}
      <div className="mt-6 flex items-center justify-between">
        <Link href="/orders" className="text-sm font-medium transition-colors" style={{ color: "var(--clr-accent)" }}>
          ← Back to all orders
        </Link>
        {isCancellable(order.status) && (
          <button
            onClick={onCancel}
            disabled={cancelling}
            className="text-sm font-medium transition-colors disabled:opacity-60"
            style={{ color: "var(--clr-error, #dc2626)" }}
          >
            {cancelling ? "Cancelling…" : "Cancel order"}
          </button>
        )}
      </div>
    </div>
  );
}
