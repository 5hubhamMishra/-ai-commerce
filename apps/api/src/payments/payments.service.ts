import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PaymentStatus, Prisma } from '@prisma/client';
import type { Payment } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { OrderEventsService } from '../common/events/order-events.service';
import { IdempotencyService } from '../common/idempotency/idempotency.service';
import { OrdersService } from '../orders/orders.service';
import { PrismaService } from '../prisma/prisma.service';
import type { ConfirmPaymentDto } from './dto/confirm-payment.dto';
import type { CreatePaymentDto } from './dto/create-payment.dto';
import type { PaymentWebhookDto } from './dto/payment-webhook.dto';
import type { RazorpayWebhookEnvelope } from './dto/razorpay-webhook-envelope';
import { PAYMENT_PROVIDER } from './providers/payment-provider.interface';
import type {
  ConfirmPaymentResult,
  PaymentProvider,
} from './providers/payment-provider.interface';

@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(PAYMENT_PROVIDER) private readonly provider: PaymentProvider,
    private readonly ordersService: OrdersService,
    private readonly idempotency: IdempotencyService,
    private readonly audit: AuditService,
    private readonly orderEvents: OrderEventsService,
  ) {}

  // ---- Client-driven flow: create intent, then confirm -----------------------

  async createPayment(
    userId: string,
    dto: CreatePaymentDto,
    idempotencyKey?: string,
  ) {
    if (!idempotencyKey) {
      throw new BadRequestException({
        code: 'IDEMPOTENCY_KEY_REQUIRED',
        message: 'An Idempotency-Key header is required to create a payment.',
      });
    }
    const result = await this.idempotency.run(
      userId,
      'payment_create',
      idempotencyKey,
      async () => ({
        statusCode: 201,
        body: await this.createPaymentInternal(
          userId,
          dto.orderId,
          idempotencyKey,
        ),
      }),
    );
    return result.body;
  }

  private async createPaymentInternal(
    userId: string,
    orderId: string,
    idempotencyKey: string,
  ) {
    const order = await this.ordersService.assertOwnership(userId, orderId);
    if (order.status !== 'PENDING_PAYMENT') {
      throw new ConflictException({
        code: 'ORDER_NOT_PAYABLE',
        message: `Order is in status ${order.status} and cannot accept a new payment.`,
      });
    }
    const existingPayment = await this.prisma.payment.findFirst({
      where: { orderId, status: PaymentStatus.PENDING },
      select: { id: true },
    });
    if (existingPayment) {
      throw new ConflictException({
        code: 'PAYMENT_ALREADY_PENDING',
        message: 'This order already has a payment attempt in progress.',
      });
    }

    // The amount comes entirely from the order the backend already computed —
    // there is no client-supplied amount anywhere in this path (spec: never
    // trust the frontend for payment amount/state).
    const amount = Number(order.total);
    const intent = await this.provider.createIntent({
      orderId,
      amount,
      currency: order.currency,
      // Different client keys can race for the same order; the provider must
      // still see one logical intent rather than one intent per request.
      idempotencyKey: `payment-${orderId}`,
    });

    let payment: Awaited<ReturnType<typeof this.prisma.payment.create>>;
    try {
      payment = await this.prisma.payment.create({
        data: {
          orderId,
          provider: this.provider.type,
          providerRef: intent.providerRef,
          status: PaymentStatus.PENDING,
          amount,
          currency: order.currency,
          idempotencyKey,
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException({
          code: 'PAYMENT_ALREADY_PENDING',
          message: 'This order already has a payment attempt in progress.',
        });
      }
      throw error;
    }

    return {
      paymentId: payment.id,
      orderId,
      providerRef: intent.providerRef,
      clientSecret: intent.clientSecret,
      amount,
      currency: order.currency,
      status: payment.status,
    };
  }

  async confirmPayment(
    userId: string,
    paymentId: string,
    dto: ConfirmPaymentDto,
    idempotencyKey?: string,
  ) {
    if (!idempotencyKey) {
      throw new BadRequestException({
        code: 'IDEMPOTENCY_KEY_REQUIRED',
        message: 'An Idempotency-Key header is required to confirm a payment.',
      });
    }
    const result = await this.idempotency.run(
      userId,
      'payment_confirm',
      idempotencyKey,
      async () => ({
        statusCode: 201,
        body: await this.confirmPaymentInternal(userId, paymentId, dto),
      }),
    );
    return result.body;
  }

  private async confirmPaymentInternal(
    userId: string,
    paymentId: string,
    dto: ConfirmPaymentDto,
  ) {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      include: { order: true },
    });
    if (!payment || payment.order.userId !== userId) {
      throw new NotFoundException({
        code: 'PAYMENT_NOT_FOUND',
        message: 'Payment not found.',
      });
    }
    if (payment.status !== PaymentStatus.PENDING) {
      // Already resolved (e.g. a race with the webhook) — replay the outcome
      // rather than erroring, consistent with idempotent confirmation handling.
      return buildOutcome(payment);
    }

    const confirmResult = await this.provider.confirmPayment({
      providerRef: payment.providerRef!,
      payload: {
        simulateFailure: dto.simulateFailure,
        razorpayPaymentId: dto.razorpayPaymentId,
        razorpaySignature: dto.razorpaySignature,
      },
    });

    const updated = await this.applyConfirmationResult(
      payment,
      userId,
      confirmResult,
    );
    return buildOutcome(updated);
  }

  // ---- Provider webhook (public — the provider can't hold our JWT) -----------

  async handleWebhook(signature: string | undefined, dto: PaymentWebhookDto) {
    if (!this.provider.verifyWebhookSignature(JSON.stringify(dto), signature)) {
      throw new BadRequestException({
        code: 'INVALID_WEBHOOK_SIGNATURE',
        message: 'Webhook signature verification failed.',
      });
    }

    const payment = await this.prisma.payment.findFirst({
      where: { providerRef: dto.providerRef },
    });
    if (!payment) {
      // Unknown reference — acknowledge without erroring so the provider doesn't
      // endlessly retry a payment we don't (or no longer) recognize.
      return { received: true };
    }
    if (payment.status !== PaymentStatus.PENDING) {
      // Already processed — replay protection for duplicate webhook delivery.
      return { received: true, alreadyProcessed: true };
    }

    await this.applyConfirmationResult(payment, null, {
      success: dto.success,
      raw: { source: 'webhook' },
    });
    return { received: true };
  }

  /** Real Razorpay webhook route — reads the raw request body directly (required for correct
   *  HMAC verification against the literal bytes Razorpay signed, not a re-serialized
   *  JSON.stringify of a parsed object, which can mismatch on key order/whitespace even for a
   *  genuine payload) and its own nested envelope shape, translating success into the same
   *  applyConfirmationResult-driven flow the dev-adapter webhook and client-confirm paths share. */
  async handleRazorpayWebhook(
    rawBody: string | undefined,
    signature: string | undefined,
  ) {
    if (!rawBody || !this.provider.verifyWebhookSignature(rawBody, signature)) {
      throw new BadRequestException({
        code: 'INVALID_WEBHOOK_SIGNATURE',
        message: 'Webhook signature verification failed.',
      });
    }

    let envelope: RazorpayWebhookEnvelope;
    try {
      envelope = JSON.parse(rawBody) as RazorpayWebhookEnvelope;
    } catch {
      throw new BadRequestException({
        code: 'INVALID_WEBHOOK_PAYLOAD',
        message: 'Webhook payload is invalid.',
      });
    }
    const paymentEntity = envelope.payload?.payment?.entity;
    if (!paymentEntity) {
      // No payment entity to act on (a webhook event type this app doesn't care about) —
      // acknowledge without erroring so Razorpay doesn't endlessly retry.
      return { received: true };
    }

    const payment = await this.prisma.payment.findFirst({
      where: { providerRef: paymentEntity.order_id },
    });
    if (!payment) {
      return { received: true };
    }
    if (payment.status !== PaymentStatus.PENDING) {
      return { received: true, alreadyProcessed: true };
    }

    await this.applyConfirmationResult(payment, null, {
      success: envelope.event === 'payment.captured',
      raw: {
        razorpayPaymentId: paymentEntity.id,
        razorpayOrderId: paymentEntity.order_id,
        source: 'webhook',
      },
      failureReason:
        envelope.event === 'payment.captured'
          ? undefined
          : `Razorpay event: ${envelope.event}`,
    });
    return { received: true };
  }

  /** Shared by the client-confirm path and the webhook path: applies a provider's
   *  success/failure outcome to a still-PENDING payment and (on success) drives
   *  the order's PAID -> CONFIRMED transition atomically with the payment write. */
  private async applyConfirmationResult(
    payment: Payment,
    actorId: string | null,
    confirmResult: ConfirmPaymentResult,
  ): Promise<Payment> {
    if (confirmResult.success) {
      // Populated by RazorpayPaymentAdapter (never the dev adapter) — refunds need the
      // payment id, not the order id providerRef already holds from createIntent time.
      const providerPaymentRef =
        typeof confirmResult.raw?.razorpayPaymentId === 'string'
          ? confirmResult.raw.razorpayPaymentId
          : undefined;
      const [updatedPayment, transition] = await this.prisma.$transaction(
        async (tx) => {
          const claimed = await tx.payment.updateMany({
            where: { id: payment.id, status: PaymentStatus.PENDING },
            data: { status: PaymentStatus.SUCCEEDED, providerPaymentRef },
          });
          const updatedPayment = await tx.payment.findUniqueOrThrow({
            where: { id: payment.id },
          });
          if (claimed.count === 0) return [updatedPayment, null] as const;

          const transition = await this.ordersService.confirmPaymentTransition(
            tx,
            payment.orderId,
            actorId,
          );
          return [updatedPayment, transition] as const;
        },
      );
      if (!transition) return updatedPayment;
      await this.audit.record({
        actorId,
        action: 'PAYMENT_SUCCEEDED',
        entityType: 'payment',
        entityId: payment.id,
        metadata: { orderId: payment.orderId },
      });
      this.orderEvents.paymentSucceeded(
        payment.orderId,
        payment.id,
        transition.userId,
      );
      return updatedPayment;
    }

    const claimed = await this.prisma.payment.updateMany({
      where: { id: payment.id, status: PaymentStatus.PENDING },
      data: {
        status: PaymentStatus.FAILED,
        failureReason: confirmResult.failureReason,
      },
    });
    const updatedPayment = await this.prisma.payment.findUniqueOrThrow({
      where: { id: payment.id },
    });
    if (claimed.count === 0) return updatedPayment;
    await this.audit.record({
      actorId,
      action: 'PAYMENT_FAILED',
      entityType: 'payment',
      entityId: payment.id,
      metadata: {
        orderId: payment.orderId,
        reason: confirmResult.failureReason,
      },
    });
    const order = await this.prisma.order.findUniqueOrThrow({
      where: { id: payment.orderId },
      select: { userId: true },
    });
    this.orderEvents.paymentFailed(payment.orderId, payment.id, order.userId);
    return updatedPayment;
  }

  // ---- Admin reconciliation --------------------------------------------------

  async listForOrder(orderId: string) {
    return this.prisma.payment.findMany({
      where: { orderId },
      orderBy: { createdAt: 'desc' },
    });
  }
}

function buildOutcome(payment: Payment) {
  return {
    paymentId: payment.id,
    orderId: payment.orderId,
    status: payment.status,
    amount: Number(payment.amount),
    currency: payment.currency,
    failureReason: payment.failureReason,
  };
}
