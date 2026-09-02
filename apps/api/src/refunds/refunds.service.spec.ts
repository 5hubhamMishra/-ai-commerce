import { BadRequestException } from '@nestjs/common';
import { Prisma, RefundStatus } from '@prisma/client';
import { RefundsService } from './refunds.service';

describe('RefundsService', () => {
  const order = { id: 'order-1', userId: 'customer-1' };
  const payment = {
    id: 'payment-1',
    amount: 1000,
    currency: 'INR',
    providerPaymentRef: 'pay_1',
    providerRef: 'order_ref_1',
  };
  const processingRefund = {
    id: 'refund-1',
    orderId: order.id,
    paymentId: payment.id,
    returnRequestId: null,
    amount: 100,
    currency: 'INR',
    reason: 'Goodwill credit',
    status: RefundStatus.PROCESSING,
    providerRef: null,
    failureReason: null,
    createdAt: new Date('2026-08-24T00:00:00.000Z'),
  };
  const completedRefund = {
    ...processingRefund,
    status: RefundStatus.COMPLETED,
    providerRef: 'rfnd_1',
  };

  let tx: {
    refund: {
      aggregate: jest.Mock;
      create: jest.Mock;
    };
  };
  let prisma: {
    order: { findUnique: jest.Mock };
    payment: { findFirst: jest.Mock };
    refund: { update: jest.Mock };
    $transaction: jest.Mock;
  };
  let provider: { refund: jest.Mock };
  let idempotency: { run: jest.Mock };
  let audit: { record: jest.Mock };
  let service: RefundsService;

  beforeEach(() => {
    tx = {
      refund: {
        aggregate: jest.fn().mockResolvedValue({ _sum: { amount: 0 } }),
        create: jest.fn().mockResolvedValue(processingRefund),
      },
    };
    prisma = {
      order: { findUnique: jest.fn().mockResolvedValue(order) },
      payment: { findFirst: jest.fn().mockResolvedValue(payment) },
      refund: { update: jest.fn().mockResolvedValue(completedRefund) },
      $transaction: jest.fn((callback: (client: typeof tx) => unknown) =>
        callback(tx),
      ),
    };
    provider = {
      refund: jest.fn().mockResolvedValue({
        success: true,
        providerRefundRef: 'rfnd_1',
        raw: {},
      }),
    };
    idempotency = {
      run: jest.fn(
        async (
          _userId: string,
          _scope: string,
          _key: string,
          operation: () => Promise<{ statusCode: number; body: unknown }>,
        ) => ({
          ...(await operation()),
          replayed: false,
        }),
      ),
    };
    audit = { record: jest.fn().mockResolvedValue(undefined) };
    service = new RefundsService(
      prisma as never,
      provider as never,
      {} as never,
      idempotency as never,
      audit as never,
    );
  });

  it('requires an idempotency key for standalone admin refunds', async () => {
    await expect(
      service.createStandalone('admin-1', {
        orderId: order.id,
        amount: 100,
        reason: 'Goodwill credit',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(idempotency.run).not.toHaveBeenCalled();
  });

  it('passes provider idempotency keys through to refund requests', async () => {
    await service.requestProviderRefund(
      'pay_1',
      100,
      'INR',
      'Return completed',
      'return-return-1',
    );

    expect(provider.refund).toHaveBeenCalledWith({
      providerRef: 'pay_1',
      amount: 100,
      currency: 'INR',
      reason: 'Return completed',
      idempotencyKey: 'return-return-1',
    });
  });

  it('maps a concurrent refund serialization conflict to a retryable error', async () => {
    prisma.$transaction.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Write conflict', {
        code: 'P2034',
        clientVersion: 'test',
      }),
    );

    await expect(
      service.createStandalone(
        'admin-1',
        { orderId: order.id, amount: 100, reason: 'Goodwill credit' },
        'refund-conflict-1',
      ),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'REFUND_CONFLICT' }),
    });
    expect(provider.refund).not.toHaveBeenCalled();
  });

  it('claims idempotency, reserves the refund, and passes the key to the provider', async () => {
    const result = await service.createStandalone(
      'admin-1',
      {
        orderId: order.id,
        amount: 100,
        reason: 'Goodwill credit',
      },
      'refund-key-1',
    );

    expect(idempotency.run).toHaveBeenCalledWith(
      'admin-1',
      'refund_create',
      'refund-key-1',
      expect.any(Function),
      expect.any(String),
    );
    expect(tx.refund.create).toHaveBeenCalledWith({
      data: {
        orderId: order.id,
        paymentId: payment.id,
        amount: 100,
        currency: 'INR',
        reason: 'Goodwill credit',
        status: RefundStatus.PROCESSING,
      },
    });
    expect(provider.refund).toHaveBeenCalledWith({
      providerRef: 'pay_1',
      amount: 100,
      currency: 'INR',
      reason: 'Goodwill credit',
      idempotencyKey: 'refund-key-1',
    });
    expect(prisma.refund.update).toHaveBeenCalledWith({
      where: { id: processingRefund.id },
      data: {
        status: RefundStatus.COMPLETED,
        providerRef: 'rfnd_1',
        failureReason: undefined,
      },
    });
    expect(result).toMatchObject({
      id: 'refund-1',
      orderId: order.id,
      status: RefundStatus.COMPLETED,
    });
  });
});
