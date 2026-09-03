import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  OrderStatus,
  PaymentStatus,
  Prisma,
  Role,
  ShipmentEventStatus,
  ShipmentStatus,
} from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { CatalogEventsService } from '../common/events/catalog-events.service';
import { OrderEventsService } from '../common/events/order-events.service';
import {
  fingerprintRequest,
  IdempotencyService,
} from '../common/idempotency/idempotency.service';
import type { AuthenticatedUser } from '../common/types/authenticated-user';
import { InventoryService } from '../inventory/inventory.service';
import { PrismaService } from '../prisma/prisma.service';
import { ShippingService } from '../shipping/shipping.service';
import type { CancelOrderDto } from './dto/cancel-order.dto';
import type { CreateOrderDto } from './dto/create-order.dto';
import type { ListOrdersQueryDto } from './dto/list-orders-query.dto';
import type { UpdateOrderStatusDto } from './dto/update-order-status.dto';
import {
  ADMIN_SETTABLE_STATUSES,
  CANCELLABLE_STATUSES,
  assertTransition,
} from './order-state-machine';

type Tx = Prisma.TransactionClient;

const ORDER_VIEW_ROLES: Role[] = [
  Role.SUPPORT_AGENT,
  Role.ADMIN,
  Role.SUPER_ADMIN,
];

const orderDetailInclude = {
  // Only the product id/slug are pulled through the variant relation — everything else
  // about the item (name/sku/price) stays the ADR-016 snapshot on OrderItem itself, never
  // re-derived from the live product. Needed so the client can link "write a review" to
  // the actual product without a separate lookup; variant is ON DELETE RESTRICT, so this
  // join is always safe to make.
  items: {
    include: {
      variant: { select: { product: { select: { id: true, slug: true } } } },
    },
  },
  shipment: {
    include: { events: { orderBy: { occurredAt: 'asc' as const } } },
  },
  payments: { orderBy: { createdAt: 'desc' as const } },
  stateHistory: { orderBy: { createdAt: 'asc' as const } },
  address: true,
} satisfies Prisma.OrderInclude;

type OrderDetailRow = Prisma.OrderGetPayload<{
  include: typeof orderDetailInclude;
}>;

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventory: InventoryService,
    private readonly shipping: ShippingService,
    private readonly idempotency: IdempotencyService,
    private readonly audit: AuditService,
    private readonly orderEvents: OrderEventsService,
    private readonly catalogEvents: CatalogEventsService,
  ) {}

  // ---- Checkout / order creation -----------------------------------------

  async create(userId: string, dto: CreateOrderDto, idempotencyKey?: string) {
    if (!idempotencyKey) {
      throw new BadRequestException({
        code: 'IDEMPOTENCY_KEY_REQUIRED',
        message: 'An Idempotency-Key header is required to place an order.',
      });
    }

    const result = await this.idempotency.run(
      userId,
      'order_create',
      idempotencyKey,
      async () => {
        const order = await this.createOrderTransactional(userId, dto);
        return { statusCode: 201, body: order };
      },
      fingerprintRequest({
        addressId: dto.addressId,
        shippingMethod: dto.shippingMethod,
      }),
    );
    return result.body;
  }

  private async createOrderTransactional(userId: string, dto: CreateOrderDto) {
    // Validates the address and computes the shipping fee for the chosen method
    // server-side — the client only ever names a method, never a price.
    const quotes = await this.shipping.quoteForCart(userId, dto.addressId);
    const methodQuote = quotes.find((q) => q.method === dto.shippingMethod);
    if (!methodQuote) {
      throw new BadRequestException({
        code: 'INVALID_SHIPPING_METHOD',
        message: 'The selected shipping method is not available.',
      });
    }

    const { order, productIds, reservations } = await this.prisma.$transaction(
      async (tx) => {
        const cart = await tx.cart.findUnique({
          where: { userId },
          include: {
            items: {
              include: {
                variant: {
                  include: { product: { include: { seller: true } } },
                },
              },
            },
          },
        });
        const items = cart?.items ?? [];
        if (items.length === 0) {
          throw new BadRequestException({
            code: 'CART_EMPTY',
            message: 'Your cart is empty.',
          });
        }
        const currency = items[0].variant.currency;
        if (items.some((item) => item.variant.currency !== currency)) {
          throw new BadRequestException({
            code: 'MIXED_CURRENCY_CART',
            message: 'All items in an order must use the same currency.',
          });
        }

        // Re-validate purchasability inside the transaction — closes the gap
        // between the shipping-quote read above and this write.
        for (const item of items) {
          const v = item.variant;
          if (
            v.deletedAt ||
            !v.isActive ||
            v.product.deletedAt ||
            v.product.status !== 'ACTIVE'
          ) {
            throw new BadRequestException({
              code: 'VARIANT_NOT_PURCHASABLE',
              message: `"${v.product.name}" is no longer available for purchase.`,
            });
          }
        }

        const reservations = await this.inventory.reserveForOrder(
          tx,
          items.map((i) => ({ variantId: i.variantId, quantity: i.quantity })),
        );
        const reservationByVariant = new Map(
          reservations.map((r) => [r.variantId, r]),
        );

        const subtotal = items.reduce(
          (sum, i) => sum + Number(i.variant.price) * i.quantity,
          0,
        );
        const shippingFee = methodQuote.fee;
        const total = subtotal + shippingFee;

        const created = await tx.order.create({
          data: {
            userId,
            addressId: dto.addressId,
            status: OrderStatus.PENDING_PAYMENT,
            subtotal,
            shippingFee,
            discountTotal: 0,
            taxTotal: 0,
            total,
            currency,
            shippingMethod: dto.shippingMethod,
            items: {
              create: items.map((i) => {
                const reservation = reservationByVariant.get(i.variantId)!;
                return {
                  variantId: i.variantId,
                  warehouseId: reservation.warehouseId,
                  sellerId: i.variant.product.sellerId,
                  productName: i.variant.product.name,
                  sku: i.variant.sku,
                  unitPrice: i.variant.price,
                  quantity: i.quantity,
                  lineTotal: Number(i.variant.price) * i.quantity,
                  currency: i.variant.currency,
                };
              }),
            },
            stateHistory: {
              create: {
                fromStatus: null,
                toStatus: OrderStatus.PENDING_PAYMENT,
                changedBy: userId,
              },
            },
            shipment: {
              create: {
                method: dto.shippingMethod,
                fee: shippingFee,
                currency,
              },
            },
          },
          include: orderDetailInclude,
        });

        await tx.cartItem.deleteMany({ where: { cartId: cart!.id } });

        // Phase 5: snapshot a commission-computed earning per marketplace
        // order item, alongside the order item itself — same "snapshot at
        // creation time" reasoning as OrderItem's own productName/sku/price
        // fields (ADR-016), so a later change to the seller's commission
        // rate never retroactively changes what a past sale earned. A
        // no-op for an all-platform-owned cart (the common case today).
        const earningsData = created.items.flatMap((orderItem) => {
          const cartItem = items.find(
            (i) => i.variantId === orderItem.variantId,
          )!;
          const seller = cartItem.variant.product.seller;
          if (!seller) return [];
          const gross = Number(orderItem.lineTotal);
          const commissionAmount =
            Math.round(gross * seller.commissionRateBps) / 10000;
          return [
            {
              sellerId: seller.id,
              orderItemId: orderItem.id,
              grossAmount: gross,
              commissionRateBps: seller.commissionRateBps,
              commissionAmount,
              netAmount: gross - commissionAmount,
              currency: orderItem.currency,
            },
          ];
        });
        if (earningsData.length > 0) {
          await tx.sellerEarning.createMany({ data: earningsData });
        }

        return {
          order: created,
          productIds: items.map((i) => i.variant.productId),
          reservations,
        };
      },
    );

    await this.audit.record({
      actorId: userId,
      action: 'ORDER_CREATED',
      entityType: 'order',
      entityId: order.id,
      metadata: {
        total: order.total.toString(),
        itemCount: order.items.length,
      },
    });
    this.orderEvents.orderCreated(order.id, userId);
    reservations.forEach((reservation, index) => {
      this.catalogEvents.inventoryChanged(
        reservation.inventoryId,
        productIds[index],
        'updated',
      );
    });

    return toOrderDetail(order);
  }

  // ---- Reads --------------------------------------------------------------

  async listForUser(userId: string, query: ListOrdersQueryDto) {
    return this.list({ userId }, query);
  }

  async listAdmin(query: ListOrdersQueryDto) {
    return this.list(query.status ? { status: query.status } : {}, query);
  }

  private async list(where: Prisma.OrderWhereInput, query: ListOrdersQueryDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const [rows, total] = await Promise.all([
      this.prisma.order.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { items: { select: { id: true } } },
      }),
      this.prisma.order.count({ where }),
    ]);

    return {
      items: rows.map((order) => ({
        id: order.id,
        status: order.status,
        total: Number(order.total),
        currency: order.currency,
        itemCount: order.items.length,
        createdAt: order.createdAt,
      })),
      total,
      page,
      pageSize,
    };
  }

  /** Owner sees their own order; SUPPORT_AGENT/ADMIN/SUPER_ADMIN can view any order. */
  async getForUser(user: AuthenticatedUser, orderId: string) {
    const order = await this.getDetailRow(orderId);
    const isOwner = order.userId === user.id;
    const isPrivileged = user.roles.some((role) =>
      ORDER_VIEW_ROLES.includes(role),
    );
    if (!isOwner && !isPrivileged) {
      // Same not-found response whether it doesn't exist or belongs to someone
      // else — never confirms another user's order ID exists (IDOR defense).
      throw new NotFoundException({
        code: 'ORDER_NOT_FOUND',
        message: 'Order not found.',
      });
    }
    return toOrderDetail(order);
  }

  async getAdminDetail(orderId: string) {
    return toOrderDetail(await this.getDetailRow(orderId));
  }

  // ---- Writes ---------------------------------------------------------------

  async cancel(user: AuthenticatedUser, orderId: string, dto: CancelOrderDto) {
    const { order, fromStatus } = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.order.findUnique({
        where: { id: orderId },
        include: { items: true },
      });
      if (!existing) {
        throw new NotFoundException({
          code: 'ORDER_NOT_FOUND',
          message: 'Order not found.',
        });
      }
      const isOwner = existing.userId === user.id;
      const isPrivileged = user.roles.some((role) =>
        ORDER_VIEW_ROLES.includes(role),
      );
      if (!isOwner && !isPrivileged) {
        throw new NotFoundException({
          code: 'ORDER_NOT_FOUND',
          message: 'Order not found.',
        });
      }
      if (!CANCELLABLE_STATUSES.includes(existing.status)) {
        throw new ConflictException({
          code: 'ORDER_NOT_CANCELLABLE',
          message: `Orders in status ${existing.status} can no longer be cancelled.`,
        });
      }
      assertTransition(existing.status, OrderStatus.CANCELLED);

      const lines = existing.items.map((i) => ({
        variantId: i.variantId,
        warehouseId: i.warehouseId,
        quantity: i.quantity,
      }));
      const cancelledAt = new Date();
      const claimed = await tx.order.updateMany({
        where: { id: orderId, status: existing.status },
        data: {
          status: OrderStatus.CANCELLED,
          cancelReason: dto.reason,
          cancelledAt,
        },
      });
      if (claimed.count === 0) {
        throw new ConflictException({
          code: 'ORDER_NOT_CANCELLABLE',
          message: 'The order changed before cancellation could be completed.',
        });
      }
      if (existing.status === OrderStatus.PENDING_PAYMENT) {
        const processingPayment = await tx.payment.findFirst({
          where: { orderId, status: PaymentStatus.PROCESSING },
          select: { id: true },
        });
        if (processingPayment) {
          throw new ConflictException({
            code: 'PAYMENT_CONFIRMATION_IN_PROGRESS',
            message:
              'This order cannot be cancelled while payment confirmation is in progress.',
          });
        }
        await tx.payment.updateMany({
          where: {
            orderId,
            status: { in: [PaymentStatus.PENDING, PaymentStatus.PROCESSING] },
          },
          data: { status: PaymentStatus.CANCELLED },
        });
        await this.inventory.releaseReserved(tx, lines);
      } else {
        await this.inventory.releaseCommitted(tx, lines);
      }

      const updated = {
        ...existing,
        status: OrderStatus.CANCELLED,
        cancelReason: dto.reason,
        cancelledAt,
      };
      await tx.orderStateHistory.create({
        data: {
          orderId,
          fromStatus: existing.status,
          toStatus: OrderStatus.CANCELLED,
          changedBy: user.id,
          note: dto.reason,
        },
      });

      return { order: updated, fromStatus: existing.status };
    });

    await this.audit.record({
      actorId: user.id,
      action: 'ORDER_CANCELLED',
      entityType: 'order',
      entityId: order.id,
      metadata: { fromStatus, reason: order.cancelReason },
    });
    this.orderEvents.orderStatusChanged(
      order.id,
      order.userId,
      fromStatus,
      OrderStatus.CANCELLED,
    );

    return toOrderDetail(await this.getDetailRow(order.id));
  }

  /** Admin fulfillment action: PROCESSING -> PACKED -> SHIPPED -> OUT_FOR_DELIVERY -> DELIVERED. */
  async updateStatusAdmin(
    actorId: string,
    orderId: string,
    dto: UpdateOrderStatusDto,
  ) {
    if (!ADMIN_SETTABLE_STATUSES.includes(dto.status)) {
      throw new BadRequestException({
        code: 'STATUS_NOT_ADMIN_SETTABLE',
        message: `${dto.status} cannot be set directly through this endpoint.`,
      });
    }
    if (
      dto.status === OrderStatus.SHIPPED &&
      (!dto.carrier || !dto.trackingNumber)
    ) {
      throw new BadRequestException({
        code: 'DISPATCH_INFO_REQUIRED',
        message:
          'carrier and trackingNumber are required to mark an order SHIPPED.',
      });
    }

    const { order, fromStatus, inventoryUpdates } =
      await this.prisma.$transaction(async (tx) => {
        const existing = await tx.order.findUnique({
          where: { id: orderId },
          include: {
            items: { include: { variant: { select: { productId: true } } } },
          },
        });
        if (!existing) {
          throw new NotFoundException({
            code: 'ORDER_NOT_FOUND',
            message: 'Order not found.',
          });
        }
        assertTransition(existing.status, dto.status);

        const lines = existing.items.map((i) => ({
          variantId: i.variantId,
          warehouseId: i.warehouseId,
          quantity: i.quantity,
        }));
        const claimed = await tx.order.updateMany({
          where: { id: orderId, status: existing.status },
          data: { status: dto.status },
        });
        if (claimed.count === 0) {
          throw new ConflictException({
            code: 'ORDER_STATUS_CHANGED',
            message: 'The order changed before this update could be completed.',
          });
        }
        if (dto.status === OrderStatus.SHIPPED) {
          await this.inventory.shipCommitted(tx, lines);
          await tx.shipment.update({
            where: { orderId },
            data: {
              carrier: dto.carrier,
              trackingNumber: dto.trackingNumber,
              status: ShipmentStatus.DISPATCHED,
              events: {
                create: {
                  status: ShipmentEventStatus.PICKED_UP,
                  description: `Dispatched via ${dto.carrier}.`,
                },
              },
            },
          });
        }
        if (dto.status === OrderStatus.DELIVERED) {
          await tx.shipment.update({
            where: { orderId },
            data: {
              status: ShipmentStatus.DELIVERED,
              events: {
                create: {
                  status: ShipmentEventStatus.DELIVERED,
                  description: 'Delivered.',
                },
              },
            },
          });
        }

        const updated = { ...existing, status: dto.status };
        await tx.orderStateHistory.create({
          data: {
            orderId,
            fromStatus: existing.status,
            toStatus: dto.status,
            changedBy: actorId,
            note: dto.note,
          },
        });

        return {
          order: updated,
          fromStatus: existing.status,
          inventoryUpdates: existing.items.map((i) => ({
            variantId: i.variantId,
            productId: i.variant.productId,
          })),
        };
      });

    await this.audit.record({
      actorId,
      action: 'ORDER_STATUS_UPDATED',
      entityType: 'order',
      entityId: order.id,
      metadata: { fromStatus, toStatus: order.status, note: dto.note },
    });
    this.orderEvents.orderStatusChanged(
      order.id,
      order.userId,
      fromStatus,
      order.status,
    );
    if (order.status === OrderStatus.SHIPPED) {
      for (const update of inventoryUpdates) {
        this.catalogEvents.inventoryChanged(
          update.variantId,
          update.productId,
          'updated',
        );
      }
    }

    return toOrderDetail(await this.getDetailRow(order.id));
  }

  // ---- Called by PaymentsService within its own transaction -----------------

  /** PAID -> CONFIRMED, committing reserved inventory. Runs inside the caller's transaction.
   *  `actorId` is null for provider-webhook-driven confirmations (no human actor). */
  async confirmPaymentTransition(
    tx: Tx,
    orderId: string,
    actorId: string | null,
  ) {
    const order = await tx.order.findUnique({
      where: { id: orderId },
      include: { items: true },
    });
    if (!order) {
      throw new NotFoundException({
        code: 'ORDER_NOT_FOUND',
        message: 'Order not found.',
      });
    }

    assertTransition(order.status, OrderStatus.PAID);
    const claimed = await tx.order.updateMany({
      where: { id: orderId, status: order.status },
      data: { status: OrderStatus.PAID },
    });
    if (claimed.count === 0) {
      throw new ConflictException({
        code: 'ORDER_STATUS_CHANGED',
        message:
          'The order changed before payment confirmation could be applied.',
      });
    }
    await tx.orderStateHistory.create({
      data: {
        orderId,
        fromStatus: order.status,
        toStatus: OrderStatus.PAID,
        changedBy: actorId,
      },
    });

    assertTransition(OrderStatus.PAID, OrderStatus.CONFIRMED);
    const lines = order.items.map((i) => ({
      variantId: i.variantId,
      warehouseId: i.warehouseId,
      quantity: i.quantity,
    }));
    await this.inventory.commitReserved(tx, lines);
    await tx.order.update({
      where: { id: orderId },
      data: { status: OrderStatus.CONFIRMED },
    });
    await tx.orderStateHistory.create({
      data: {
        orderId,
        fromStatus: OrderStatus.PAID,
        toStatus: OrderStatus.CONFIRMED,
        changedBy: actorId,
      },
    });

    return { userId: order.userId, fromStatus: order.status };
  }

  // ---- Order tracking ---------------------------------------------------

  /** Admin appends a tracking-timeline event without touching Order.status —
   *  the two state machines (order fulfillment vs. carrier tracking detail)
   *  stay independent; DELIVERED is still only ever set via updateStatusAdmin. */
  async addTrackingEvent(
    actorId: string,
    orderId: string,
    status: ShipmentEventStatus,
    location: string | undefined,
    description: string | undefined,
  ) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { shipment: true },
    });
    if (!order || !order.shipment) {
      throw new NotFoundException({
        code: 'SHIPMENT_NOT_FOUND',
        message: 'This order has not been dispatched yet.',
      });
    }

    await this.prisma.shipmentEvent.create({
      data: { shipmentId: order.shipment.id, status, location, description },
    });
    await this.audit.record({
      actorId,
      action: 'SHIPMENT_TRACKING_EVENT_ADDED',
      entityType: 'shipment',
      entityId: order.shipment.id,
      metadata: { orderId, status, location },
    });

    return toOrderDetail(await this.getDetailRow(orderId));
  }

  /** Owner sees their own order's tracking; SUPPORT_AGENT/ADMIN/SUPER_ADMIN can view any. */
  async getTracking(user: AuthenticatedUser, orderId: string) {
    const detail = await this.getForUser(user, orderId);
    return {
      orderId: detail.id,
      orderStatus: detail.status,
      shipment: detail.shipment,
    };
  }

  // ---- Called by ReturnsService/RefundsService/ReplacementsService/
  // ExchangesService within their own transactions, mirroring
  // confirmPaymentTransition's pattern. Each loads the order fresh (so the
  // caller doesn't need to pass a stale row), asserts the transition, writes
  // the new status + history entry, and returns just what the caller needs.

  async markReturnRequested(tx: Tx, orderId: string, actorId: string) {
    return this.transitionWithinTx(
      tx,
      orderId,
      OrderStatus.RETURN_REQUESTED,
      actorId,
    );
  }

  /** Return rejected (at review or after failed inspection) or withdrawn by the customer. */
  async markReturnClosed(
    tx: Tx,
    orderId: string,
    actorId: string,
    note?: string,
  ) {
    return this.transitionWithinTx(
      tx,
      orderId,
      OrderStatus.DELIVERED,
      actorId,
      note,
    );
  }

  async markReturned(tx: Tx, orderId: string, actorId: string) {
    return this.transitionWithinTx(tx, orderId, OrderStatus.RETURNED, actorId);
  }

  async markRefunded(tx: Tx, orderId: string, actorId: string | null) {
    return this.transitionWithinTx(tx, orderId, OrderStatus.REFUNDED, actorId);
  }

  async markReplacement(tx: Tx, orderId: string, actorId: string) {
    return this.transitionWithinTx(
      tx,
      orderId,
      OrderStatus.REPLACEMENT,
      actorId,
    );
  }

  async markExchanged(tx: Tx, orderId: string, actorId: string) {
    return this.transitionWithinTx(tx, orderId, OrderStatus.EXCHANGED, actorId);
  }

  private async transitionWithinTx(
    tx: Tx,
    orderId: string,
    toStatus: OrderStatus,
    actorId: string | null,
    note?: string,
  ) {
    const order = await tx.order.findUnique({ where: { id: orderId } });
    if (!order) {
      throw new NotFoundException({
        code: 'ORDER_NOT_FOUND',
        message: 'Order not found.',
      });
    }
    assertTransition(order.status, toStatus);
    const claimed = await tx.order.updateMany({
      where: { id: orderId, status: order.status },
      data: { status: toStatus },
    });
    if (claimed.count === 0) {
      throw new ConflictException({
        code: 'ORDER_STATUS_CHANGED',
        message: 'The order changed before this update could be applied.',
      });
    }
    await tx.orderStateHistory.create({
      data: {
        orderId,
        fromStatus: order.status,
        toStatus,
        changedBy: actorId,
        note,
      },
    });
    return { userId: order.userId, fromStatus: order.status };
  }

  async assertOwnership(userId: string, orderId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
    });
    if (!order || order.userId !== userId) {
      throw new NotFoundException({
        code: 'ORDER_NOT_FOUND',
        message: 'Order not found.',
      });
    }
    return order;
  }

  private async getDetailRow(orderId: string): Promise<OrderDetailRow> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: orderDetailInclude,
    });
    if (!order) {
      throw new NotFoundException({
        code: 'ORDER_NOT_FOUND',
        message: 'Order not found.',
      });
    }
    return order;
  }
}

function toOrderDetail(order: OrderDetailRow) {
  return {
    id: order.id,
    status: order.status,
    subtotal: Number(order.subtotal),
    shippingFee: Number(order.shippingFee),
    discountTotal: Number(order.discountTotal),
    taxTotal: Number(order.taxTotal),
    total: Number(order.total),
    currency: order.currency,
    shippingMethod: order.shippingMethod,
    cancelReason: order.cancelReason,
    cancelledAt: order.cancelledAt,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
    address: {
      line1: order.address.line1,
      line2: order.address.line2,
      city: order.address.city,
      state: order.address.state,
      postalCode: order.address.postalCode,
      country: order.address.country,
    },
    items: order.items.map((item) => ({
      id: item.id,
      variantId: item.variantId,
      productId: item.variant.product.id,
      productSlug: item.variant.product.slug,
      productName: item.productName,
      sku: item.sku,
      unitPrice: Number(item.unitPrice),
      quantity: item.quantity,
      lineTotal: Number(item.lineTotal),
      currency: item.currency,
    })),
    shipment: order.shipment
      ? {
          method: order.shipment.method,
          fee: Number(order.shipment.fee),
          status: order.shipment.status,
          carrier: order.shipment.carrier,
          trackingNumber: order.shipment.trackingNumber,
          events: order.shipment.events.map((e) => ({
            status: e.status,
            location: e.location,
            description: e.description,
            occurredAt: e.occurredAt,
          })),
        }
      : null,
    payments: order.payments.map((payment) => ({
      id: payment.id,
      provider: payment.provider,
      status: payment.status,
      amount: Number(payment.amount),
      currency: payment.currency,
      createdAt: payment.createdAt,
    })),
    stateHistory: order.stateHistory.map((h) => ({
      fromStatus: h.fromStatus,
      toStatus: h.toStatus,
      note: h.note,
      changedAt: h.createdAt,
    })),
  };
}
