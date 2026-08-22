"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { AdminSettableOrderStatus, OrderDetail, ShipmentEventStatus } from "@ai-commerce/types";
import { ApiError, ordersApi } from "@ai-commerce/api-client";
import { useStore } from "@/lib/store";
import { hasAnyRole, ADMIN_SURFACE_ROLES } from "@/lib/roles";
import { formatPrice } from "@/lib/format";
import { ORDER_STATUS_BADGE, ORDER_STATUS_LABELS } from "@/lib/order-status";
import { RowsPageSkeleton } from "@/components/Skeleton";

const SETTABLE_STATUSES: AdminSettableOrderStatus[] = ["PROCESSING", "PACKED", "SHIPPED", "OUT_FOR_DELIVERY", "DELIVERED"];
const SHIPMENT_EVENT_STATUSES: ShipmentEventStatus[] = [
  "LABEL_CREATED",
  "PICKED_UP",
  "IN_TRANSIT",
  "OUT_FOR_DELIVERY",
  "DELIVERED",
  "FAILED_DELIVERY",
  "RETURNED_TO_SENDER",
];

function accessDeniedMessage(err: unknown, fallback: string): string {
  if (err instanceof ApiError && err.status === 403) return "You don't have the role required to do this.";
  if (err instanceof Error) return err.message;
  return fallback;
}

export default function AdminOrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const hydrated = useStore((s) => s.hydrated);
  const authStatus = useStore((s) => s.authStatus);
  const user = useStore((s) => s.user);
  const authorized = hasAnyRole(user, ADMIN_SURFACE_ROLES);

  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [nextStatus, setNextStatus] = useState<AdminSettableOrderStatus>("PROCESSING");
  const [note, setNote] = useState("");
  const [carrier, setCarrier] = useState("");
  const [trackingNumber, setTrackingNumber] = useState("");
  const [updating, setUpdating] = useState(false);
  const [updateError, setUpdateError] = useState<string | null>(null);

  const [eventStatus, setEventStatus] = useState<ShipmentEventStatus>("IN_TRANSIT");
  const [eventLocation, setEventLocation] = useState("");
  const [eventDescription, setEventDescription] = useState("");
  const [addingEvent, setAddingEvent] = useState(false);
  const [eventError, setEventError] = useState<string | null>(null);

  useEffect(() => {
    if (!hydrated) return;
    if (authStatus === "unauthenticated") router.replace(`/login?redirect=${encodeURIComponent(`/admin/orders/${id}`)}`);
  }, [hydrated, authStatus, router, id]);

  useEffect(() => {
    if (authStatus !== "authenticated" || !authorized) return;
    ordersApi
      .adminGet(id)
      .then(setOrder)
      .catch((err) => setLoadError(accessDeniedMessage(err, "Couldn't load this order.")));
  }, [authStatus, authorized, id]);

  async function onUpdateStatus(e: React.FormEvent) {
    e.preventDefault();
    setUpdateError(null);
    setUpdating(true);
    try {
      const updated = await ordersApi.adminUpdateStatus(id, {
        status: nextStatus,
        note: note.trim() || undefined,
        carrier: nextStatus === "SHIPPED" ? carrier.trim() || undefined : undefined,
        trackingNumber: nextStatus === "SHIPPED" ? trackingNumber.trim() || undefined : undefined,
      });
      setOrder(updated);
      setNote("");
    } catch (err) {
      setUpdateError(accessDeniedMessage(err, "Couldn't update the order status."));
    } finally {
      setUpdating(false);
    }
  }

  async function onAddTrackingEvent(e: React.FormEvent) {
    e.preventDefault();
    setEventError(null);
    setAddingEvent(true);
    try {
      const updated = await ordersApi.adminAddTrackingEvent(id, {
        status: eventStatus,
        location: eventLocation.trim() || undefined,
        description: eventDescription.trim() || undefined,
      });
      setOrder(updated);
      setEventLocation("");
      setEventDescription("");
    } catch (err) {
      setEventError(accessDeniedMessage(err, "Couldn't add that tracking event."));
    } finally {
      setAddingEvent(false);
    }
  }

  if (!hydrated || authStatus === "idle" || authStatus === "checking") return <RowsPageSkeleton rows={1} />;
  if (authStatus === "unauthenticated") return null;

  if (!authorized) {
    return (
      <div className="mx-auto max-w-lg px-4 py-24 text-center">
        <h1 className="font-display text-xl font-semibold" style={{ color: "var(--clr-text-primary)" }}>Not authorized</h1>
        <Link href="/" className="mt-5 btn btn-accent inline-flex">Back to shop</Link>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="mx-auto max-w-lg px-4 py-24 text-center">
        <p className="text-sm" style={{ color: "var(--clr-error, #dc2626)" }}>{loadError}</p>
        <Link href="/admin" className="mt-5 btn btn-accent inline-flex">Back to dashboard</Link>
      </div>
    );
  }

  if (!order) return <RowsPageSkeleton rows={1} />;

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
      <nav className="text-xs mb-6" style={{ color: "var(--clr-text-secondary)" }}>
        <Link href="/admin" className="hover:text-[var(--clr-accent)] transition-colors">Dashboard</Link>
        <span className="mx-1.5">›</span>
        <span style={{ color: "var(--clr-text-primary)" }}>{order.id.slice(0, 8)}</span>
      </nav>

      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold break-all" style={{ color: "var(--clr-text-primary)" }}>{order.id}</h1>
          <p className="text-sm mt-1" style={{ color: "var(--clr-text-secondary)" }}>
            Placed {new Date(order.createdAt).toLocaleString("en-IN")}
          </p>
        </div>
        <span className={`badge badge-${ORDER_STATUS_BADGE[order.status]} self-start`}>{ORDER_STATUS_LABELS[order.status]}</span>
      </div>

      <div className="mt-6 rounded-2xl border overflow-hidden" style={{ borderColor: "var(--clr-border)", background: "var(--clr-surface)" }}>
        <div className="px-5 py-4 border-b" style={{ borderColor: "var(--clr-border)" }}>
          <h2 className="font-display text-lg font-semibold">Items</h2>
        </div>
        <div className="divide-y" style={{ borderColor: "var(--clr-border)" }}>
          {order.items.map((item) => (
            <div key={item.id} className="flex items-center justify-between gap-4 px-5 py-3 text-sm">
              <div>
                <p style={{ color: "var(--clr-text-primary)" }}>{item.productName}</p>
                <p className="text-xs" style={{ color: "var(--clr-text-disabled)" }}>{item.sku} · Qty {item.quantity}</p>
              </div>
              <span className="font-semibold">{formatPrice(item.lineTotal)}</span>
            </div>
          ))}
        </div>
        <div className="px-5 py-4 border-t flex justify-between font-semibold" style={{ borderColor: "var(--clr-border)", background: "var(--clr-surface-2)" }}>
          <span>Total</span>
          <span>{formatPrice(order.total)}</span>
        </div>
      </div>

      <div className="mt-4 rounded-2xl border p-5" style={{ borderColor: "var(--clr-border)", background: "var(--clr-surface)" }}>
        <p className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color: "var(--clr-text-disabled)" }}>Shipping to</p>
        <p className="text-sm">
          {order.address.line1}{order.address.line2 ? `, ${order.address.line2}` : ""}, {order.address.city}, {order.address.state} {order.address.postalCode}, {order.address.country}
        </p>
      </div>

      {order.payments.length > 0 && (
        <div className="mt-4 rounded-2xl border p-5" style={{ borderColor: "var(--clr-border)", background: "var(--clr-surface)" }}>
          <p className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color: "var(--clr-text-disabled)" }}>Payments</p>
          {order.payments.map((p) => (
            <p key={p.id} className="text-sm">{p.provider} · {p.status} · {formatPrice(p.amount)}</p>
          ))}
        </div>
      )}

      {order.stateHistory.length > 0 && (
        <div className="mt-4 rounded-2xl border p-5" style={{ borderColor: "var(--clr-border)", background: "var(--clr-surface)" }}>
          <p className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color: "var(--clr-text-disabled)" }}>Status history</p>
          <ul className="space-y-1.5 text-sm">
            {order.stateHistory.map((h, i) => (
              <li key={i} className="flex justify-between" style={{ color: "var(--clr-text-secondary)" }}>
                <span>{h.fromStatus ? `${h.fromStatus} → ${h.toStatus}` : h.toStatus}{h.note ? ` — ${h.note}` : ""}</span>
                <span>{new Date(h.changedAt).toLocaleDateString("en-IN")}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-6 rounded-2xl border p-5" style={{ borderColor: "var(--clr-border)", background: "var(--clr-surface)" }}>
        <h2 className="font-display text-lg font-semibold mb-3">Update status</h2>
        <form onSubmit={onUpdateStatus} className="space-y-3">
          <select
            value={nextStatus}
            onChange={(e) => setNextStatus(e.target.value as AdminSettableOrderStatus)}
            className="rounded-xl border border-[var(--clr-border)] px-3.5 py-2.5 text-sm w-full"
          >
            {SETTABLE_STATUSES.map((s) => (
              <option key={s} value={s}>{ORDER_STATUS_LABELS[s]}</option>
            ))}
          </select>
          {nextStatus === "SHIPPED" && (
            <div className="grid grid-cols-2 gap-3">
              <input value={carrier} onChange={(e) => setCarrier(e.target.value)} placeholder="Carrier" required className="rounded-xl border border-[var(--clr-border)] px-3.5 py-2.5 text-sm" />
              <input value={trackingNumber} onChange={(e) => setTrackingNumber(e.target.value)} placeholder="Tracking number" required className="rounded-xl border border-[var(--clr-border)] px-3.5 py-2.5 text-sm" />
            </div>
          )}
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional)" className="rounded-xl border border-[var(--clr-border)] px-3.5 py-2.5 text-sm w-full" />
          {updateError && <p className="text-sm" style={{ color: "var(--clr-error, #dc2626)" }}>{updateError}</p>}
          <button type="submit" disabled={updating} className="btn btn-accent px-5 py-2 text-sm disabled:opacity-50">
            {updating ? "Updating…" : "Update status"}
          </button>
        </form>
      </div>

      {order.shipment && (
        <div className="mt-4 rounded-2xl border p-5" style={{ borderColor: "var(--clr-border)", background: "var(--clr-surface)" }}>
          <h2 className="font-display text-lg font-semibold mb-3">Add tracking event</h2>
          <form onSubmit={onAddTrackingEvent} className="space-y-3">
            <select
              value={eventStatus}
              onChange={(e) => setEventStatus(e.target.value as ShipmentEventStatus)}
              className="rounded-xl border border-[var(--clr-border)] px-3.5 py-2.5 text-sm w-full"
            >
              {SHIPMENT_EVENT_STATUSES.map((s) => (
                <option key={s} value={s}>{s.replaceAll("_", " ")}</option>
              ))}
            </select>
            <input value={eventLocation} onChange={(e) => setEventLocation(e.target.value)} placeholder="Location (optional)" className="rounded-xl border border-[var(--clr-border)] px-3.5 py-2.5 text-sm w-full" />
            <input value={eventDescription} onChange={(e) => setEventDescription(e.target.value)} placeholder="Description (optional)" className="rounded-xl border border-[var(--clr-border)] px-3.5 py-2.5 text-sm w-full" />
            {eventError && <p className="text-sm" style={{ color: "var(--clr-error, #dc2626)" }}>{eventError}</p>}
            <button type="submit" disabled={addingEvent} className="btn btn-accent px-5 py-2 text-sm disabled:opacity-50">
              {addingEvent ? "Adding…" : "Add event"}
            </button>
          </form>
          {order.shipment.events.length > 0 && (
            <ul className="mt-4 space-y-1.5 text-xs" style={{ color: "var(--clr-text-secondary)" }}>
              {order.shipment.events.map((e, i) => (
                <li key={i} className="flex justify-between">
                  <span>{e.status.replaceAll("_", " ")}{e.location ? ` — ${e.location}` : ""}</span>
                  <span>{new Date(e.occurredAt).toLocaleDateString("en-IN")}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
