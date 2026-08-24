/** Matches the Prisma `OrderStatus` enum (apps/api/prisma/schema.prisma) — the full state
 *  machine, not just the "happy path" a customer usually sees (apps/api/src/orders/
 *  order-state-machine.ts governs which transitions are legal). */
export type OrderStatus =
  | "PENDING_PAYMENT"
  | "PAID"
  | "CONFIRMED"
  | "PROCESSING"
  | "PACKED"
  | "SHIPPED"
  | "OUT_FOR_DELIVERY"
  | "DELIVERED"
  | "CANCELLED"
  | "RETURN_REQUESTED"
  | "REFUND_PENDING"
  | "REFUNDED"
  | "RETURNED"
  | "REPLACEMENT"
  | "EXCHANGED";

/** Matches the Prisma `PaymentStatus` enum. */
export type PaymentStatus = "PENDING" | "SUCCEEDED" | "FAILED" | "REFUNDED" | "CANCELLED";

/** Matches the Prisma `ShipmentStatus` enum. */
export type ShipmentStatus = "PENDING" | "DISPATCHED" | "IN_TRANSIT" | "DELIVERED" | "FAILED";

/** Matches the Prisma `ShipmentEventStatus` enum. */
export type ShipmentEventStatus =
  | "LABEL_CREATED"
  | "PICKED_UP"
  | "IN_TRANSIT"
  | "OUT_FOR_DELIVERY"
  | "DELIVERED"
  | "FAILED_DELIVERY"
  | "RETURNED_TO_SENDER";

/** Matches `CreateOrderDto` in apps/api/src/orders/dto/create-order.dto.ts. Line items are
 *  never sent by the client — they're derived server-side from the caller's current cart. */
export type CreateOrderInput = {
  addressId: string;
  shippingMethod: "STANDARD" | "EXPRESS";
};

export type OrderItemDetail = {
  id: string;
  variantId: string;
  productId: string;
  productSlug: string;
  productName: string;
  sku: string;
  unitPrice: number;
  quantity: number;
  lineTotal: number;
  currency: string;
};

export type OrderAddressSnapshot = {
  line1: string;
  line2: string | null;
  city: string;
  state: string;
  postalCode: string;
  country: string;
};

export type ShipmentEvent = {
  status: ShipmentEventStatus;
  location: string | null;
  description: string | null;
  occurredAt: string;
};

export type OrderShipment = {
  method: string;
  fee: number;
  status: ShipmentStatus;
  carrier: string | null;
  trackingNumber: string | null;
  events: ShipmentEvent[];
};

export type OrderPaymentSummary = {
  id: string;
  provider: string;
  status: PaymentStatus;
  amount: number;
  currency: string;
  createdAt: string;
};

export type OrderStateHistoryEntry = {
  fromStatus: OrderStatus | null;
  toStatus: OrderStatus;
  note: string | null;
  changedAt: string;
};

/** Matches `toOrderDetail()` in apps/api/src/orders/orders.service.ts — the shape every
 *  order endpoint (create/detail/cancel) returns. */
export type OrderDetail = {
  id: string;
  status: OrderStatus;
  subtotal: number;
  shippingFee: number;
  discountTotal: number;
  taxTotal: number;
  total: number;
  currency: string;
  shippingMethod: string;
  cancelReason: string | null;
  cancelledAt: string | null;
  createdAt: string;
  updatedAt: string;
  address: OrderAddressSnapshot;
  items: OrderItemDetail[];
  shipment: OrderShipment | null;
  payments: OrderPaymentSummary[];
  stateHistory: OrderStateHistoryEntry[];
};

/** Matches the per-row shape in `OrdersService.list()`'s `GET /orders` response. */
export type OrderListItem = {
  id: string;
  status: OrderStatus;
  total: number;
  currency: string;
  itemCount: number;
  createdAt: string;
};

export type ListOrdersResponse = {
  items: OrderListItem[];
  total: number;
  page: number;
  pageSize: number;
};

export type ListOrdersQuery = {
  page?: number;
  pageSize?: number;
};

/** The subset of `OrderStatus` an admin may set directly via `PATCH /orders/admin/:id/status`
 *  (apps/api/src/orders/order-state-machine.ts's `ADMIN_SETTABLE_STATUSES`) — the
 *  fulfillment happy path only; return/refund transitions are driven by their own
 *  dedicated endpoints, not this one. */
export type AdminSettableOrderStatus = "PROCESSING" | "PACKED" | "SHIPPED" | "OUT_FOR_DELIVERY" | "DELIVERED";

/** Matches `UpdateOrderStatusDto`. `carrier`/`trackingNumber` are required by the service
 *  (not the DTO itself) when `status === 'SHIPPED'`. */
export type UpdateOrderStatusInput = {
  status: AdminSettableOrderStatus;
  note?: string;
  carrier?: string;
  trackingNumber?: string;
};

/** Matches `AddTrackingEventDto` — apps/api 404s with `SHIPMENT_NOT_FOUND` if the order
 *  hasn't shipped yet (no `Shipment` row to attach the event to). */
export type AddTrackingEventInput = {
  status: ShipmentEventStatus;
  location?: string;
  description?: string;
};
