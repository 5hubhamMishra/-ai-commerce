import type { OrderStatus } from "@ai-commerce/types";

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  PENDING_PAYMENT: "Payment pending",
  PAID: "Payment received",
  CONFIRMED: "Order confirmed",
  PROCESSING: "Being prepared",
  PACKED: "Packed",
  SHIPPED: "Shipped",
  OUT_FOR_DELIVERY: "Out for delivery",
  DELIVERED: "Delivered",
  CANCELLED: "Cancelled",
  RETURN_REQUESTED: "Return requested",
  REFUND_PENDING: "Refund pending",
  REFUNDED: "Refunded",
  RETURNED: "Returned",
  REPLACEMENT: "Replacement in progress",
  EXCHANGED: "Exchanged",
};

export type OrderBadgeVariant = "success" | "warning" | "error" | "accent" | "subtle";

export const ORDER_STATUS_BADGE: Record<OrderStatus, OrderBadgeVariant> = {
  PENDING_PAYMENT: "warning",
  PAID: "accent",
  CONFIRMED: "success",
  PROCESSING: "accent",
  PACKED: "accent",
  SHIPPED: "accent",
  OUT_FOR_DELIVERY: "accent",
  DELIVERED: "success",
  CANCELLED: "error",
  RETURN_REQUESTED: "warning",
  REFUND_PENDING: "warning",
  REFUNDED: "subtle",
  RETURNED: "subtle",
  REPLACEMENT: "accent",
  EXCHANGED: "success",
};

/** The linear happy-path sequence a normal order moves through once payment is confirmed.
 *  Everything else (CANCELLED, RETURN_REQUESTED, REFUND_PENDING, REFUNDED, RETURNED,
 *  REPLACEMENT, EXCHANGED) is a branch off this path — rendered as just a status badge
 *  instead of forced onto the linear tracker. */
export const ORDER_PROGRESS_STAGES: OrderStatus[] = [
  "CONFIRMED",
  "PROCESSING",
  "PACKED",
  "SHIPPED",
  "OUT_FOR_DELIVERY",
  "DELIVERED",
];

/** -1 before the tracker starts (still PENDING_PAYMENT/PAID) or for a status off the
 *  happy path entirely — callers should check `isOnHappyPath` first for the latter case. */
export function progressStageIndex(status: OrderStatus): number {
  return ORDER_PROGRESS_STAGES.indexOf(status);
}

export function isOnHappyPath(status: OrderStatus): boolean {
  return status === "PENDING_PAYMENT" || status === "PAID" || progressStageIndex(status) >= 0;
}

const CANCELLABLE_STATUSES: OrderStatus[] = ["PENDING_PAYMENT", "CONFIRMED"];

export function isCancellable(status: OrderStatus): boolean {
  return CANCELLABLE_STATUSES.includes(status);
}
