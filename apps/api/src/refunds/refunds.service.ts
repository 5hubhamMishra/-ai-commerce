import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import { Prisma, RefundStatus } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { OrderEventsService } from '../common/events/order-events.service';
import { IdempotencyService } from '../common/idempotency/idempotency.service';
import { OrdersService } from '../orders/orders.service';
import {
  PAYMENT_PROVIDER,
  type PaymentProvider,
  type RefundResult,
} from '../payments/providers/payment-provider.interface';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateRefundDto } from './dto/create-refund.dto';

type Tx = Prisma.TransactionClient;

@Injectable()
export class RefundsService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(PAYMENT_PROVIDER) private readonly provider: PaymentProvider,
    private readonly ordersService: OrdersService,
    private readonly idempotency: IdempotencyService,
    private readonly audit: AuditService,
    private readonly orderEvents: OrderEventsService,
  ) {}

  /** Calls the payment provider — deliberately outside any DB transaction,
   *  same as PaymentsService's createIntent/confirmPayment calls, so a slow or
   *  failed external call never holds a DB transaction open. */
  async requestProviderRefund(
    providerRef: string,
    amount: number,
    currency: string,
    reason: string,
    idempotencyKey?: string,
  ): Promise<RefundResult> {
    return this.provider.refund({
      providerRef,
      amount,
      currency,
      reason,
      idempotencyKey,
    });
  }

  /** Called by ReturnsService.complete() inside its own transaction — creates
   *  the Refund row with whatever outcome `requestProviderRefund` already
   *  returned, and (only on success) drives the order's RETURNED -> REFUNDED
   *  transition through OrdersService's own tx-aware helper. */
  async createRefundRecordTx(
    tx: Tx,
    params: {
      orderId: string;
      paymentId: string;
      returnRequestId: string;
      amount: number;
      currency: string;
      reason: string;
      result: RefundResult;
    },
    actorId: string,
  ) {
    const refund = await tx.refund.create({
      data: {
        orderId: params.orderId,
        paymentId: params.paymentId,
        returnRequestId: params.returnRequestId,
        amount: params.amount,
        currency: params.currency,
        reason: params.reason,
        status: params.result.success
          ? RefundStatus.COMPLETED
          : RefundStatus.FAILED,
        providerRef: params.result.providerRefundRef,
        failureReason: params.result.failureReason,
      },
    });

    if (params.result.success) {
      await this.ordersService.markRefunded(tx, params.orderId, actorId);
    }
    return refund;
  }

  /** Admin-initiated refund not tied to a return (goodwill/cancellation
   *  adjustment) — doesn't transition order status, since the order's own
   *  fulfillment state isn't necessarily affected by a partial goodwill refund.
   *
   *  Idempotency-gated the same way PaymentsService.createPayment is: a retried
   *  or double-submitted admin request must not issue a second real refund
   *  through the payment provider (the `refundable` amount check below only
   *  guards against exceeding the payment total, not against replaying the
   *  same logical request). */
  async createStandalone(
    actorId: string,
    dto: CreateRefundDto,
    idempotencyKey?: string,
  ) {
    if (!idempotencyKey) {
      throw new BadRequestException({
        code: 'IDEMPOTENCY_KEY_REQUIRED',
        message: 'An Idempotency-Key header is required to issue a refund.',
      });
    }
    const result = await this.idempotency.run(
      actorId,
      'refund_create',
      idempotencyKey,
      async () => ({
        statusCode: 201,
        body: await this.createStandaloneInternal(actorId, dto, idempotencyKey),
      }),
      fingerprintRefundRequest(dto),
    );
    return result.body;
  }

  private async createStandaloneInternal(
    actorId: string,
    dto: CreateRefundDto,
    idempotencyKey: string,
  ) {
    const order = await this.prisma.order.findUnique({
      where: { id: dto.orderId },
    });
    if (!order) {
      throw new NotFoundException({
        code: 'ORDER_NOT_FOUND',
        message: 'Order not found.',
      });
    }

    const payment = await this.prisma.payment.findFirst({
      where: { orderId: dto.orderId, status: 'SUCCEEDED' },
      orderBy: { createdAt: 'desc' },
    });
    if (!payment) {
      throw new ConflictException({
        code: 'NO_SUCCESSFUL_PAYMENT',
        message: 'This order has no successful payment to refund against.',
      });
    }

    const refund = await this.prisma.$transaction(
      async (tx) => {
        const alreadyClaimed = await tx.refund.aggregate({
          where: {
            paymentId: payment.id,
            status: { not: RefundStatus.FAILED },
          },
          _sum: { amount: true },
        });
        const refundable =
          Number(payment.amount) - Number(alreadyClaimed._sum.amount ?? 0);
        if (dto.amount > refundable) {
          throw new BadRequestException({
            code: 'REFUND_EXCEEDS_REMAINING_AMOUNT',
            message: `This payment has ${refundable.toFixed(2)} left refundable.`,
          });
        }

        return tx.refund.create({
          data: {
            orderId: dto.orderId,
            paymentId: payment.id,
            amount: dto.amount,
            currency: payment.currency,
            reason: dto.reason,
            status: RefundStatus.PROCESSING,
          },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );

    let result: RefundResult;
    try {
      result = await this.requestProviderRefund(
        payment.providerPaymentRef ?? payment.providerRef!,
        dto.amount,
        payment.currency,
        dto.reason,
        idempotencyKey,
      );
    } catch (error) {
      result = {
        success: false,
        providerRefundRef: '',
        raw: {},
        failureReason:
          error instanceof Error
            ? error.message
            : 'Refund provider request failed.',
      };
    }

    const updatedRefund = await this.prisma.refund.update({
      where: { id: refund.id },
      data: {
        status: result.success ? RefundStatus.COMPLETED : RefundStatus.FAILED,
        providerRef: result.providerRefundRef || null,
        failureReason: result.failureReason,
      },
    });

    await this.audit.record({
      actorId,
      action: 'REFUND_ISSUED',
      entityType: 'refund',
      entityId: updatedRefund.id,
      metadata: {
        orderId: dto.orderId,
        amount: dto.amount,
        standalone: true,
        idempotencyKey,
      },
    });
    if (result.success) {
      this.orderEvents.paymentSucceeded(dto.orderId, payment.id, order.userId);
    }

    return toRefundView(updatedRefund);
  }

  async listForOrder(orderId: string) {
    const refunds = await this.prisma.refund.findMany({
      where: { orderId },
      orderBy: { createdAt: 'desc' },
    });
    return refunds.map(toRefundView);
  }

  async getById(refundId: string) {
    const refund = await this.prisma.refund.findUnique({
      where: { id: refundId },
    });
    if (!refund) {
      throw new NotFoundException({
        code: 'REFUND_NOT_FOUND',
        message: 'Refund not found.',
      });
    }
    return toRefundView(refund);
  }
}

function toRefundView(refund: {
  id: string;
  orderId: string;
  paymentId: string;
  returnRequestId: string | null;
  amount: Prisma.Decimal;
  currency: string;
  reason: string;
  status: RefundStatus;
  providerRef: string | null;
  failureReason: string | null;
  createdAt: Date;
}) {
  return {
    id: refund.id,
    orderId: refund.orderId,
    paymentId: refund.paymentId,
    returnRequestId: refund.returnRequestId,
    amount: Number(refund.amount),
    currency: refund.currency,
    reason: refund.reason,
    status: refund.status,
    failureReason: refund.failureReason,
    createdAt: refund.createdAt,
  };
}

function fingerprintRefundRequest(dto: CreateRefundDto): string {
  return createHash('sha256')
    .update(
      JSON.stringify({
        orderId: dto.orderId,
        amount: Number(dto.amount),
        reason: dto.reason,
      }),
    )
    .digest('hex');
}
