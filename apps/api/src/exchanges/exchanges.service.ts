import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ExchangeStatus, Prisma, RefundStatus } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { OrdersService } from '../orders/orders.service';
import {
  PAYMENT_PROVIDER,
  type PaymentProvider,
} from '../payments/providers/payment-provider.interface';
import { PrismaService } from '../prisma/prisma.service';
import type { DispatchExchangeDto } from './dto/dispatch-exchange.dto';

type Tx = Prisma.TransactionClient;

// Linear with one branch (price difference) — small in-file map, same rationale
// as replacements/replacements.service.ts.
const TRANSITIONS: Record<ExchangeStatus, ExchangeStatus[]> = {
  REQUESTED: [ExchangeStatus.APPROVED, ExchangeStatus.CANCELLED],
  AWAITING_PAYMENT: [ExchangeStatus.APPROVED, ExchangeStatus.CANCELLED],
  APPROVED: [ExchangeStatus.SHIPPED, ExchangeStatus.CANCELLED],
  SHIPPED: [ExchangeStatus.DELIVERED],
  DELIVERED: [],
  CANCELLED: [],
};

function assertTransition(from: ExchangeStatus, to: ExchangeStatus) {
  if (!TRANSITIONS[from]?.includes(to)) {
    throw new ConflictException({
      code: 'INVALID_EXCHANGE_TRANSITION',
      message: `Cannot transition an exchange from ${from} to ${to}.`,
    });
  }
}

@Injectable()
export class ExchangesService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(PAYMENT_PROVIDER) private readonly provider: PaymentProvider,
    private readonly ordersService: OrdersService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Called by ReturnsService.complete() inside its own transaction. Settles the
   * price difference immediately where that's possible without a new checkout:
   * a negative difference (money owed back to the customer) is refunded against
   * the original payment right here; a positive difference (customer owes more)
   * starts the exchange in AWAITING_PAYMENT — collecting it is a manual
   * admin-confirmation step (`confirmPaymentReceived`) rather than a full second
   * payment-intent flow, a deliberate scope trim for what's a comparatively rare
   * case (most exchanges are equal-priced variant swaps, priceDifference = 0).
   */
  async createExchangeRecordTx(
    tx: Tx,
    params: {
      returnRequestId: string;
      orderId: string;
      originalVariantId: string;
      newVariantId: string;
      quantity: number;
      priceDifference: number;
      paymentId: string | null;
      currency: string;
    },
    actorId: string,
  ) {
    const needsPayment = params.priceDifference > 0;
    const owesRefund = params.priceDifference < 0;

    const exchange = await tx.exchange.create({
      data: {
        returnRequestId: params.returnRequestId,
        orderId: params.orderId,
        originalVariantId: params.originalVariantId,
        newVariantId: params.newVariantId,
        quantity: params.quantity,
        priceDifference: params.priceDifference,
        status: needsPayment
          ? ExchangeStatus.AWAITING_PAYMENT
          : ExchangeStatus.APPROVED,
      },
    });

    if (owesRefund && params.paymentId) {
      const payment = await tx.payment.findUniqueOrThrow({
        where: { id: params.paymentId },
      });
      const result = await this.provider.refund({
        providerRef: payment.providerPaymentRef ?? payment.providerRef!,
        amount: Math.abs(params.priceDifference),
        currency: params.currency,
        reason: 'Exchange price difference (lower-priced item)',
        idempotencyKey: `exchange-${params.returnRequestId}`,
      });
      if (!result.success) {
        throw new ConflictException({
          code: 'REFUND_FAILED',
          message:
            'The refund provider did not complete the refund. Try completing the return again.',
        });
      }
      await tx.refund.create({
        data: {
          orderId: params.orderId,
          paymentId: params.paymentId,
          returnRequestId: params.returnRequestId,
          amount: Math.abs(params.priceDifference),
          currency: params.currency,
          reason: 'Exchange price difference',
          status: result.success ? RefundStatus.COMPLETED : RefundStatus.FAILED,
          providerRef: result.providerRefundRef,
          failureReason: result.failureReason,
        },
      });
    }

    await this.ordersService.markExchanged(tx, params.orderId, actorId);
    return exchange;
  }

  /** Admin confirms the price-difference payment was collected (manually, for
   *  now — see the class doc comment on why this isn't a full payment-intent flow). */
  async confirmPaymentReceived(actorId: string, exchangeId: string) {
    const exchange = await this.getRow(exchangeId);
    assertTransition(exchange.status, ExchangeStatus.APPROVED);

    const claimed = await this.prisma.exchange.updateMany({
      where: { id: exchangeId, status: exchange.status },
      data: { status: ExchangeStatus.APPROVED },
    });
    if (claimed.count === 0) {
      throw new ConflictException({
        code: 'EXCHANGE_STATUS_CHANGED',
        message:
          'The exchange changed before payment confirmation could be applied.',
      });
    }
    const updated = { ...exchange, status: ExchangeStatus.APPROVED };
    await this.audit.record({
      actorId,
      action: 'EXCHANGE_PAYMENT_CONFIRMED',
      entityType: 'exchange',
      entityId: exchangeId,
    });
    return toExchangeView(updated);
  }

  async dispatch(
    actorId: string,
    exchangeId: string,
    dto: DispatchExchangeDto,
  ) {
    const exchange = await this.getRow(exchangeId);
    assertTransition(exchange.status, ExchangeStatus.SHIPPED);

    const claimed = await this.prisma.exchange.updateMany({
      where: { id: exchangeId, status: exchange.status },
      data: {
        status: ExchangeStatus.SHIPPED,
        carrier: dto.carrier,
        trackingNumber: dto.trackingNumber,
      },
    });
    if (claimed.count === 0) {
      throw new ConflictException({
        code: 'EXCHANGE_STATUS_CHANGED',
        message: 'The exchange changed before dispatch could be applied.',
      });
    }
    const updated = {
      ...exchange,
      status: ExchangeStatus.SHIPPED,
      carrier: dto.carrier,
      trackingNumber: dto.trackingNumber,
    };
    await this.audit.record({
      actorId,
      action: 'EXCHANGE_DISPATCHED',
      entityType: 'exchange',
      entityId: exchangeId,
      metadata: { carrier: dto.carrier, trackingNumber: dto.trackingNumber },
    });
    return toExchangeView(updated);
  }

  async markDelivered(actorId: string, exchangeId: string) {
    const exchange = await this.getRow(exchangeId);
    assertTransition(exchange.status, ExchangeStatus.DELIVERED);

    const claimed = await this.prisma.exchange.updateMany({
      where: { id: exchangeId, status: exchange.status },
      data: { status: ExchangeStatus.DELIVERED },
    });
    if (claimed.count === 0) {
      throw new ConflictException({
        code: 'EXCHANGE_STATUS_CHANGED',
        message: 'The exchange changed before delivery could be applied.',
      });
    }
    const updated = { ...exchange, status: ExchangeStatus.DELIVERED };
    await this.audit.record({
      actorId,
      action: 'EXCHANGE_DELIVERED',
      entityType: 'exchange',
      entityId: exchangeId,
    });
    return toExchangeView(updated);
  }

  async listForOrder(orderId: string) {
    const rows = await this.prisma.exchange.findMany({
      where: { orderId },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(toExchangeView);
  }

  async getById(exchangeId: string) {
    return toExchangeView(await this.getRow(exchangeId));
  }

  private async getRow(exchangeId: string) {
    const exchange = await this.prisma.exchange.findUnique({
      where: { id: exchangeId },
    });
    if (!exchange) {
      throw new NotFoundException({
        code: 'EXCHANGE_NOT_FOUND',
        message: 'Exchange not found.',
      });
    }
    return exchange;
  }
}

function toExchangeView(exchange: {
  id: string;
  returnRequestId: string;
  orderId: string;
  originalVariantId: string;
  newVariantId: string;
  quantity: number;
  priceDifference: Prisma.Decimal;
  status: ExchangeStatus;
  carrier: string | null;
  trackingNumber: string | null;
  createdAt: Date;
}) {
  return {
    id: exchange.id,
    returnRequestId: exchange.returnRequestId,
    orderId: exchange.orderId,
    originalVariantId: exchange.originalVariantId,
    newVariantId: exchange.newVariantId,
    quantity: exchange.quantity,
    priceDifference: Number(exchange.priceDifference),
    status: exchange.status,
    carrier: exchange.carrier,
    trackingNumber: exchange.trackingNumber,
    createdAt: exchange.createdAt,
  };
}
