import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  NotificationType,
  OrderStatus,
  Prisma,
  ReturnResolution,
  ReturnStatus,
} from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { OrderEventsService } from '../common/events/order-events.service';
import type { AuthenticatedUser } from '../common/types/authenticated-user';
import { NotificationsService } from '../notifications/notifications.service';
import { ExchangesService } from '../exchanges/exchanges.service';
import { InventoryService } from '../inventory/inventory.service';
import { OrdersService } from '../orders/orders.service';
import { PrismaService } from '../prisma/prisma.service';
import { ReplacementsService } from '../replacements/replacements.service';
import { RefundsService } from '../refunds/refunds.service';
import type { CompleteReturnDto } from './dto/complete-return.dto';
import type { CreateReturnDto } from './dto/create-return.dto';
import type { RejectReturnDto } from './dto/reject-return.dto';
import {
  CUSTOMER_CANCELLABLE_STATUSES,
  assertReturnTransition,
} from './return-state-machine';

const NON_TERMINAL_RETURN_STATUSES: ReturnStatus[] = [
  ReturnStatus.REQUESTED,
  ReturnStatus.APPROVED,
  ReturnStatus.PICKUP_SCHEDULED,
  ReturnStatus.PICKED_UP,
  ReturnStatus.INSPECTING,
];

const returnDetailInclude = {
  items: { include: { orderItem: true } },
  order: true,
  refund: true,
  replacement: { include: { items: true } },
  exchange: true,
} as const;

@Injectable()
export class ReturnsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly inventoryService: InventoryService,
    private readonly ordersService: OrdersService,
    private readonly refundsService: RefundsService,
    private readonly replacementsService: ReplacementsService,
    private readonly exchangesService: ExchangesService,
    private readonly audit: AuditService,
    private readonly orderEvents: OrderEventsService,
    private readonly notifications: NotificationsService,
  ) {}

  // ---- Create / cancel (customer) --------------------------------------------

  async create(user: AuthenticatedUser, dto: CreateReturnDto) {
    if (
      dto.resolution === ReturnResolution.EXCHANGE &&
      dto.items.length !== 1
    ) {
      throw new BadRequestException({
        code: 'EXCHANGE_SINGLE_ITEM_ONLY',
        message:
          'An exchange can only be requested for one order item at a time.',
      });
    }

    const order = await this.prisma.order.findUnique({
      where: { id: dto.orderId },
      include: {
        items: { include: { variant: { include: { product: true } } } },
      },
    });
    if (!order || order.userId !== user.id) {
      throw new NotFoundException({
        code: 'ORDER_NOT_FOUND',
        message: 'Order not found.',
      });
    }
    // Checked before the DELIVERED check: once a return is requested the
    // order itself moves off DELIVERED (to RETURN_REQUESTED), so a second
    // concurrent request must still surface as "already in progress" rather
    // than being masked by the more generic "not returnable" branch below.
    const existingActive = await this.prisma.returnRequest.findFirst({
      where: {
        orderId: dto.orderId,
        status: { in: NON_TERMINAL_RETURN_STATUSES },
      },
    });
    if (existingActive) {
      throw new ConflictException({
        code: 'RETURN_ALREADY_IN_PROGRESS',
        message: 'A return is already in progress for this order.',
      });
    }

    if (order.status !== OrderStatus.DELIVERED) {
      throw new ConflictException({
        code: 'ORDER_NOT_RETURNABLE',
        message: 'Only delivered orders can be returned.',
      });
    }

    const orderItemsById = new Map(order.items.map((i) => [i.id, i]));
    const seenOrderItemIds = new Set<string>();
    for (const line of dto.items) {
      if (seenOrderItemIds.has(line.orderItemId)) {
        throw new BadRequestException({
          code: 'RETURN_ITEM_DUPLICATE',
          message: `Order item ${line.orderItemId} may only appear once in a return request.`,
        });
      }
      seenOrderItemIds.add(line.orderItemId);
      const orderItem = orderItemsById.get(line.orderItemId);
      if (!orderItem) {
        throw new BadRequestException({
          code: 'ORDER_ITEM_NOT_FOUND',
          message: `Order item ${line.orderItemId} does not belong to this order.`,
        });
      }
      if (line.quantity > orderItem.quantity) {
        throw new BadRequestException({
          code: 'RETURN_QUANTITY_EXCEEDS_ORDERED',
          message: `Cannot return more than the ${orderItem.quantity} unit(s) originally ordered.`,
        });
      }
    }

    if (dto.resolution === ReturnResolution.EXCHANGE) {
      const desired = await this.prisma.productVariant.findUnique({
        where: { id: dto.desiredVariantId },
      });
      if (!desired || desired.deletedAt || !desired.isActive) {
        throw new BadRequestException({
          code: 'VARIANT_NOT_PURCHASABLE',
          message: 'The desired exchange variant is not available.',
        });
      }
    }

    await this.assertWithinReturnWindow(order.id, dto.items, orderItemsById);

    const returnRequest = await this.prisma.$transaction(async (tx) => {
      let created: Awaited<ReturnType<typeof this.prisma.returnRequest.create>>;
      try {
        created = await tx.returnRequest.create({
          data: {
            orderId: dto.orderId,
            userId: user.id,
            reason: dto.reason,
            reasonNote: dto.reasonNote,
            resolution: dto.resolution,
            desiredVariantId: dto.desiredVariantId,
            items: {
              create: dto.items.map((i) => ({
                orderItemId: i.orderItemId,
                quantity: i.quantity,
              })),
            },
          },
        });
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2002'
        ) {
          throw new ConflictException({
            code: 'RETURN_ALREADY_IN_PROGRESS',
            message: 'A return is already in progress for this order.',
          });
        }
        throw error;
      }
      await this.ordersService.markReturnRequested(tx, dto.orderId, user.id);
      return created;
    });

    await this.audit.record({
      actorId: user.id,
      action: 'RETURN_REQUESTED',
      entityType: 'return_request',
      entityId: returnRequest.id,
      metadata: { orderId: dto.orderId, resolution: dto.resolution },
    });
    this.orderEvents.orderStatusChanged(
      dto.orderId,
      user.id,
      OrderStatus.DELIVERED,
      OrderStatus.RETURN_REQUESTED,
    );
    await this.notifications.create(
      user.id,
      NotificationType.RETURN,
      'Return requested',
      'We received your return request and will review it shortly.',
      'return_request',
      returnRequest.id,
    );

    return this.getForUser(user, returnRequest.id);
  }

  async cancel(user: AuthenticatedUser, returnId: string) {
    const existing = await this.getOwnedRow(user, returnId);
    if (!CUSTOMER_CANCELLABLE_STATUSES.includes(existing.status)) {
      throw new ConflictException({
        code: 'RETURN_NOT_CANCELLABLE',
        message: `Returns in status ${existing.status} can no longer be cancelled.`,
      });
    }
    assertReturnTransition(existing.status, ReturnStatus.CANCELLED);

    await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.returnRequest.updateMany({
        where: { id: returnId, status: existing.status },
        data: { status: ReturnStatus.CANCELLED },
      });
      if (claimed.count === 0) {
        throw new ConflictException({
          code: 'RETURN_STATUS_CHANGED',
          message: 'The return changed before cancellation could be applied.',
        });
      }
      await this.ordersService.markReturnClosed(
        tx,
        existing.orderId,
        user.id,
        'Cancelled by customer',
      );
    });

    await this.audit.record({
      actorId: user.id,
      action: 'RETURN_CANCELLED',
      entityType: 'return_request',
      entityId: returnId,
    });
    this.orderEvents.orderStatusChanged(
      existing.orderId,
      user.id,
      OrderStatus.RETURN_REQUESTED,
      OrderStatus.DELIVERED,
    );

    return this.getForUser(user, returnId);
  }

  // ---- Admin review pipeline --------------------------------------------------

  async approve(actorId: string, returnId: string) {
    const existing = await this.getRow(returnId);
    assertReturnTransition(existing.status, ReturnStatus.APPROVED);
    const claimed = await this.prisma.returnRequest.updateMany({
      where: { id: returnId, status: existing.status },
      data: { status: ReturnStatus.APPROVED },
    });
    if (claimed.count === 0) {
      throw new ConflictException({
        code: 'RETURN_STATUS_CHANGED',
        message: 'The return changed before approval could be applied.',
      });
    }
    await this.audit.record({
      actorId,
      action: 'RETURN_APPROVED',
      entityType: 'return_request',
      entityId: returnId,
    });
    await this.notifications.create(
      existing.userId,
      NotificationType.RETURN,
      'Return approved',
      'Your return request has been approved.',
      'return_request',
      returnId,
    );
    return this.getAdminDetail(returnId);
  }

  async reject(actorId: string, returnId: string, dto: RejectReturnDto) {
    const existing = await this.getRow(returnId);
    assertReturnTransition(existing.status, ReturnStatus.REJECTED);

    await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.returnRequest.updateMany({
        where: { id: returnId, status: existing.status },
        data: { status: ReturnStatus.REJECTED, rejectReason: dto.reason },
      });
      if (claimed.count === 0) {
        throw new ConflictException({
          code: 'RETURN_STATUS_CHANGED',
          message: 'The return changed before rejection could be applied.',
        });
      }
      await this.ordersService.markReturnClosed(
        tx,
        existing.orderId,
        actorId,
        dto.reason,
      );
    });

    await this.audit.record({
      actorId,
      action: 'RETURN_REJECTED',
      entityType: 'return_request',
      entityId: returnId,
      metadata: { reason: dto.reason },
    });
    this.orderEvents.orderStatusChanged(
      existing.orderId,
      existing.userId,
      OrderStatus.RETURN_REQUESTED,
      OrderStatus.DELIVERED,
    );
    await this.notifications.create(
      existing.userId,
      NotificationType.RETURN,
      'Return rejected',
      `Your return request was rejected: ${dto.reason}`,
      'return_request',
      returnId,
    );

    return this.getAdminDetail(returnId);
  }

  async schedulePickup(actorId: string, returnId: string) {
    return this.simpleAdminTransition(
      actorId,
      returnId,
      ReturnStatus.PICKUP_SCHEDULED,
      'RETURN_PICKUP_SCHEDULED',
    );
  }

  async markPickedUp(actorId: string, returnId: string) {
    return this.simpleAdminTransition(
      actorId,
      returnId,
      ReturnStatus.PICKED_UP,
      'RETURN_PICKED_UP',
    );
  }

  async startInspection(actorId: string, returnId: string) {
    return this.simpleAdminTransition(
      actorId,
      returnId,
      ReturnStatus.INSPECTING,
      'RETURN_INSPECTION_STARTED',
    );
  }

  private async simpleAdminTransition(
    actorId: string,
    returnId: string,
    toStatus: ReturnStatus,
    auditAction: string,
  ) {
    const existing = await this.getRow(returnId);
    assertReturnTransition(existing.status, toStatus);
    const claimed = await this.prisma.returnRequest.updateMany({
      where: { id: returnId, status: existing.status },
      data: { status: toStatus },
    });
    if (claimed.count === 0) {
      throw new ConflictException({
        code: 'RETURN_STATUS_CHANGED',
        message: 'The return changed before this update could be applied.',
      });
    }
    await this.audit.record({
      actorId,
      action: auditAction,
      entityType: 'return_request',
      entityId: returnId,
    });
    return this.getAdminDetail(returnId);
  }

  /**
   * The terminal step: records inspection outcomes, restocks/damages
   * inventory, marks the return COMPLETED, transitions the order
   * RETURN_REQUESTED -> RETURNED, then creates whichever outcome the customer
   * originally chose (refund/replacement/exchange) — each via its own
   * service's tx-aware `create*RecordTx` helper, composed into this single
   * transaction (same cross-service-transaction pattern PaymentsService uses
   * for confirmPaymentTransition). External provider calls (refund charge,
   * for REFUND/negative-difference EXCHANGE) happen before the transaction
   * opens, same reasoning as everywhere else in this codebase that mixes a
   * provider call with a DB write.
   */
  async complete(actorId: string, returnId: string, dto: CompleteReturnDto) {
    const existing = await this.getRow(returnId);
    assertReturnTransition(existing.status, ReturnStatus.COMPLETED);
    this.assertAllItemsInspected(existing.items, dto.items);

    const inspectedById = new Map(
      dto.items.map((i) => [i.returnRequestItemId, i]),
    );
    const restockLines = existing.items.map((item) => {
      const inspected = inspectedById.get(item.id)!;
      return {
        variantId: item.orderItem.variantId,
        warehouseId: item.orderItem.warehouseId,
        quantity: item.quantity,
        isDamaged: inspected.isDamaged,
      };
    });

    let refundContext: {
      paymentId: string;
      amount: number;
      currency: string;
      result: Awaited<ReturnType<RefundsService['requestProviderRefund']>>;
    } | null = null;
    let exchangeContext: {
      newVariantId: string;
      priceDifference: number;
      paymentId: string | null;
    } | null = null;

    if (existing.resolution === ReturnResolution.REFUND) {
      const amount = existing.items.reduce(
        (sum, item) => sum + Number(item.orderItem.unitPrice) * item.quantity,
        0,
      );
      const payment = await this.findSucceededPayment(existing.orderId);
      const result = await this.refundsService.requestProviderRefund(
        payment.providerPaymentRef ?? payment.providerRef!,
        amount,
        payment.currency,
        'Return completed',
        `return-${returnId}`,
      );
      if (!result.success) {
        throw new ConflictException({
          code: 'REFUND_FAILED',
          message:
            'The refund provider did not complete the refund. Try completing the return again.',
        });
      }
      refundContext = {
        paymentId: payment.id,
        amount,
        currency: payment.currency,
        result,
      };
    } else if (existing.resolution === ReturnResolution.EXCHANGE) {
      const newVariant = await this.prisma.productVariant.findUniqueOrThrow({
        where: { id: existing.desiredVariantId! },
      });
      const item = existing.items[0];
      const priceDifference =
        (Number(newVariant.price) - Number(item.orderItem.unitPrice)) *
        item.quantity;
      const payment =
        priceDifference !== 0
          ? await this.findSucceededPayment(existing.orderId)
          : null;
      exchangeContext = {
        newVariantId: newVariant.id,
        priceDifference,
        paymentId: payment?.id ?? null,
      };
    }

    const outcome = await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.returnRequest.updateMany({
        where: { id: returnId, status: ReturnStatus.INSPECTING },
        data: { status: ReturnStatus.COMPLETED },
      });
      if (claimed.count === 0) {
        throw new ConflictException({
          code: 'RETURN_STATUS_CHANGED',
          message: 'The return changed before completion could be applied.',
        });
      }
      for (const item of existing.items) {
        const inspected = inspectedById.get(item.id)!;
        await tx.returnRequestItem.update({
          where: { id: item.id },
          data: { condition: inspected.condition },
        });
      }
      await this.inventoryService.restockReturnedItems(tx, restockLines);

      await this.ordersService.markReturned(tx, existing.orderId, actorId);

      if (existing.resolution === ReturnResolution.REFUND) {
        const refund = await this.refundsService.createRefundRecordTx(
          tx,
          {
            orderId: existing.orderId,
            paymentId: refundContext!.paymentId,
            returnRequestId: returnId,
            amount: refundContext!.amount,
            currency: refundContext!.currency,
            reason: 'Return completed',
            result: refundContext!.result,
          },
          actorId,
        );
        return { type: 'REFUND' as const, refund };
      }

      if (existing.resolution === ReturnResolution.REPLACEMENT) {
        const replacement =
          await this.replacementsService.createReplacementRecordTx(
            tx,
            {
              returnRequestId: returnId,
              orderId: existing.orderId,
              items: existing.items.map((i) => ({
                variantId: i.orderItem.variantId,
                quantity: i.quantity,
              })),
            },
            actorId,
          );
        return { type: 'REPLACEMENT' as const, replacement };
      }

      const item = existing.items[0];
      const exchange = await this.exchangesService.createExchangeRecordTx(
        tx,
        {
          returnRequestId: returnId,
          orderId: existing.orderId,
          originalVariantId: item.orderItem.variantId,
          newVariantId: exchangeContext!.newVariantId,
          quantity: item.quantity,
          priceDifference: exchangeContext!.priceDifference,
          paymentId: exchangeContext!.paymentId,
          currency: existing.order.currency,
        },
        actorId,
      );
      return { type: 'EXCHANGE' as const, exchange };
    });

    await this.audit.record({
      actorId,
      action: 'RETURN_COMPLETED',
      entityType: 'return_request',
      entityId: returnId,
      metadata: { resolution: existing.resolution, outcome: outcome.type },
    });
    await this.notifications.create(
      existing.userId,
      {
        REFUND: NotificationType.REFUND,
        REPLACEMENT: NotificationType.REPLACEMENT,
        EXCHANGE: NotificationType.EXCHANGE,
      }[outcome.type],
      'Return completed',
      `Your return has been processed as a ${outcome.type.toLowerCase()}.`,
      'return_request',
      returnId,
    );

    return this.getAdminDetail(returnId);
  }

  // ---- Reads --------------------------------------------------------------

  async listForUser(userId: string) {
    const rows = await this.prisma.returnRequest.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: { items: true },
    });
    return rows.map(toReturnSummary);
  }

  async listAdmin(status?: ReturnStatus) {
    const rows = await this.prisma.returnRequest.findMany({
      where: status ? { status } : {},
      orderBy: { createdAt: 'desc' },
      include: { items: true },
    });
    return rows.map(toReturnSummary);
  }

  async getForUser(user: AuthenticatedUser, returnId: string) {
    const row = await this.getRow(returnId);
    if (row.userId !== user.id) {
      throw new NotFoundException({
        code: 'RETURN_NOT_FOUND',
        message: 'Return request not found.',
      });
    }
    return toReturnDetail(row);
  }

  async getAdminDetail(returnId: string) {
    return toReturnDetail(await this.getRow(returnId));
  }

  // ---- Helpers --------------------------------------------------------------

  private async findSucceededPayment(orderId: string) {
    const payment = await this.prisma.payment.findFirst({
      where: { orderId, status: 'SUCCEEDED' },
      orderBy: { createdAt: 'desc' },
    });
    if (!payment) {
      throw new ConflictException({
        code: 'NO_SUCCESSFUL_PAYMENT',
        message: 'This order has no successful payment to refund against.',
      });
    }
    return payment;
  }

  private assertAllItemsInspected(
    items: { id: string }[],
    inspected: { returnRequestItemId: string }[],
  ) {
    const inspectedIds = new Set(inspected.map((i) => i.returnRequestItemId));
    if (inspectedIds.size !== inspected.length) {
      throw new BadRequestException({
        code: 'INSPECTION_ITEM_DUPLICATE',
        message: 'Each returned line item may only be inspected once.',
      });
    }
    const itemIds = new Set(items.map((i) => i.id));
    if ([...inspectedIds].some((id) => !itemIds.has(id))) {
      throw new BadRequestException({
        code: 'INSPECTION_ITEM_NOT_FOUND',
        message: 'Inspection results must belong to this return request.',
      });
    }
    const missing = items.filter((i) => !inspectedIds.has(i.id));
    if (missing.length > 0) {
      throw new BadRequestException({
        code: 'INSPECTION_INCOMPLETE',
        message: 'Every returned line item must have an inspection result.',
      });
    }
  }

  private async assertWithinReturnWindow(
    orderId: string,
    items: { orderItemId: string; quantity: number }[],
    orderItemsById: Map<string, { variantId: string }>,
  ) {
    const deliveredEvent = await this.prisma.orderStateHistory.findFirst({
      where: { orderId, toStatus: OrderStatus.DELIVERED },
      orderBy: { createdAt: 'desc' },
    });
    if (!deliveredEvent) {
      throw new ConflictException({
        code: 'ORDER_NOT_RETURNABLE',
        message: 'This order has no recorded delivery date.',
      });
    }

    const variantIds = items.map(
      (i) => orderItemsById.get(i.orderItemId)!.variantId,
    );
    const categories = await this.prisma.category.findMany({
      where: {
        products: { some: { variants: { some: { id: { in: variantIds } } } } },
      },
      select: { returnWindowDays: true },
    });
    const defaultWindow = this.config.get<number>('returns.defaultWindowDays')!;
    const windowDays = categories.length
      ? Math.min(...categories.map((c) => c.returnWindowDays ?? defaultWindow))
      : defaultWindow;

    const deadline = new Date(deliveredEvent.createdAt);
    deadline.setDate(deadline.getDate() + windowDays);
    if (new Date() > deadline) {
      throw new ConflictException({
        code: 'RETURN_WINDOW_EXPIRED',
        message: `The return window (${windowDays} days from delivery) has passed.`,
      });
    }
  }

  private async getOwnedRow(user: AuthenticatedUser, returnId: string) {
    const row = await this.getRow(returnId);
    if (row.userId !== user.id) {
      throw new NotFoundException({
        code: 'RETURN_NOT_FOUND',
        message: 'Return request not found.',
      });
    }
    return row;
  }

  private async getRow(returnId: string) {
    const row = await this.prisma.returnRequest.findUnique({
      where: { id: returnId },
      include: returnDetailInclude,
    });
    if (!row) {
      throw new NotFoundException({
        code: 'RETURN_NOT_FOUND',
        message: 'Return request not found.',
      });
    }
    return row;
  }
}

function toReturnSummary(row: {
  id: string;
  orderId: string;
  status: ReturnStatus;
  resolution: ReturnResolution;
  reason: string;
  createdAt: Date;
  items: { id: string }[];
}) {
  return {
    id: row.id,
    orderId: row.orderId,
    status: row.status,
    resolution: row.resolution,
    reason: row.reason,
    itemCount: row.items.length,
    createdAt: row.createdAt,
  };
}

type ReturnDetailRow = Awaited<ReturnType<ReturnsService['getRow']>>;

function toReturnDetail(row: ReturnDetailRow) {
  return {
    id: row.id,
    orderId: row.orderId,
    status: row.status,
    resolution: row.resolution,
    reason: row.reason,
    reasonNote: row.reasonNote,
    rejectReason: row.rejectReason,
    desiredVariantId: row.desiredVariantId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    items: row.items.map((item) => ({
      id: item.id,
      orderItemId: item.orderItemId,
      quantity: item.quantity,
      condition: item.condition,
      productName: item.orderItem.productName,
      sku: item.orderItem.sku,
    })),
    refund: row.refund
      ? {
          id: row.refund.id,
          status: row.refund.status,
          amount: Number(row.refund.amount),
          currency: row.refund.currency,
        }
      : null,
    replacement: row.replacement
      ? {
          id: row.replacement.id,
          status: row.replacement.status,
          carrier: row.replacement.carrier,
          trackingNumber: row.replacement.trackingNumber,
        }
      : null,
    exchange: row.exchange
      ? {
          id: row.exchange.id,
          status: row.exchange.status,
          newVariantId: row.exchange.newVariantId,
          priceDifference: Number(row.exchange.priceDifference),
          carrier: row.exchange.carrier,
          trackingNumber: row.exchange.trackingNumber,
        }
      : null,
  };
}
