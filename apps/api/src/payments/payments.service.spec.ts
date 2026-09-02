import { OrderStatus, PaymentStatus, Prisma } from '@prisma/client';
import { PaymentsService } from './payments.service';

describe('PaymentsService settlement race', () => {
  it('fingerprints payment create and confirm inputs when claiming keys', async () => {
    const run = jest.fn().mockResolvedValue({ body: {} });
    const service = new PaymentsService(
      {} as never,
      {} as never,
      {} as never,
      { run } as never,
      {} as never,
      {} as never,
    );

    await service.createPayment('user-1', { orderId: 'order-1' }, 'key-1');
    await service.createPayment('user-1', { orderId: 'order-2' }, 'key-1');
    await service.confirmPayment('user-1', 'payment-1', {}, 'key-2');
    await service.confirmPayment(
      'user-1',
      'payment-1',
      { simulateFailure: true },
      'key-2',
    );

    expect(run.mock.calls[0][4]).toEqual(expect.any(String));
    expect(run.mock.calls[0][4]).not.toBe(run.mock.calls[1][4]);
    expect(run.mock.calls[2][4]).toEqual(expect.any(String));
    expect(run.mock.calls[2][4]).not.toBe(run.mock.calls[3][4]);
  });

  it('rejects a malformed signed Razorpay payload as a bad request', async () => {
    const service = new PaymentsService(
      {} as never,
      { verifyWebhookSignature: jest.fn().mockReturnValue(true) } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await expect(
      service.handleRazorpayWebhook('{', 'valid-signature'),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'INVALID_WEBHOOK_PAYLOAD' }),
    });
  });

  it('rejects a signed Razorpay payment payload without provider identifiers', async () => {
    const findFirst = jest.fn();
    const service = new PaymentsService(
      { payment: { findFirst } } as never,
      { verifyWebhookSignature: jest.fn().mockReturnValue(true) } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await expect(
      service.handleRazorpayWebhook(
        JSON.stringify({
          event: 'payment.captured',
          payload: { payment: { entity: { id: 'pay_1' } } },
        }),
        'valid-signature',
      ),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'INVALID_WEBHOOK_PAYLOAD' }),
    });
    expect(findFirst).not.toHaveBeenCalled();
  });

  it('acknowledges non-terminal Razorpay events without changing payment state', async () => {
    const findFirst = jest.fn();
    const service = new PaymentsService(
      { payment: { findFirst } } as never,
      { verifyWebhookSignature: jest.fn().mockReturnValue(true) } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await expect(
      service.handleRazorpayWebhook(
        JSON.stringify({
          event: 'payment.authorized',
          payload: {
            payment: { entity: { id: 'pay_1', order_id: 'order_1' } },
          },
        }),
        'valid-signature',
      ),
    ).resolves.toEqual({ received: true, ignored: true });
    expect(findFirst).not.toHaveBeenCalled();
  });

  it('maps a concurrent pending-payment race to a conflict', async () => {
    const paymentCreate = jest.fn().mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: 'test',
      }),
    );
    const prisma = {
      payment: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
      $transaction: jest.fn((callback: (tx: unknown) => unknown) =>
        callback({
          order: {
            updateMany: jest.fn().mockResolvedValue({ count: 1 }),
          },
          payment: { create: paymentCreate },
        }),
      ),
    };
    const createIntent = jest.fn().mockResolvedValue({ providerRef: 'ref-1' });
    const service = new PaymentsService(
      prisma as never,
      {
        type: 'DEVELOPMENT',
        createIntent,
      } as never,
      {
        assertOwnership: jest.fn().mockResolvedValue({
          status: 'PENDING_PAYMENT',
          total: 100,
          currency: 'INR',
        }),
      } as never,
      {} as never,
      {} as never,
      {} as never,
    );
    const createInternal = (
      service as unknown as {
        createPaymentInternal: (
          userId: string,
          orderId: string,
          key: string,
        ) => Promise<unknown>;
      }
    ).createPaymentInternal;

    await expect(
      createInternal.call(service, 'user1', 'order1', 'key1'),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'PAYMENT_ALREADY_PENDING' }),
    });
    expect(paymentCreate).toHaveBeenCalled();
    expect(createIntent).toHaveBeenCalledWith({
      orderId: 'order1',
      amount: 100,
      currency: 'INR',
      idempotencyKey: 'payment-order1',
    });
  });

  it('does not create a payment after the order is cancelled', async () => {
    const paymentCreate = jest.fn();
    const orderUpdateMany = jest.fn().mockResolvedValue({ count: 0 });
    const prisma = {
      payment: { findFirst: jest.fn().mockResolvedValue(null) },
      $transaction: jest.fn((callback: (tx: unknown) => unknown) =>
        callback({
          order: { updateMany: orderUpdateMany },
          payment: { create: paymentCreate },
        }),
      ),
    };
    const service = new PaymentsService(
      prisma as never,
      {
        type: 'DEVELOPMENT',
        createIntent: jest.fn().mockResolvedValue({ providerRef: 'ref-1' }),
      } as never,
      {
        assertOwnership: jest.fn().mockResolvedValue({
          status: OrderStatus.PENDING_PAYMENT,
          total: 100,
          currency: 'INR',
        }),
      } as never,
      {} as never,
      {} as never,
      {} as never,
    );
    const createInternal = (
      service as unknown as {
        createPaymentInternal: (
          userId: string,
          orderId: string,
          key: string,
        ) => Promise<unknown>;
      }
    ).createPaymentInternal;

    await expect(
      createInternal.call(service, 'user1', 'order1', 'key1'),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'ORDER_NOT_PAYABLE' }),
    });
    expect(orderUpdateMany).toHaveBeenCalledWith({
      where: {
        id: 'order1',
        userId: 'user1',
        status: OrderStatus.PENDING_PAYMENT,
      },
      data: { updatedAt: expect.any(Date) },
    });
    expect(paymentCreate).not.toHaveBeenCalled();
  });

  it('does not transition the order when another request already claimed payment', async () => {
    const payment = {
      id: 'payment-1',
      orderId: 'order-1',
      status: PaymentStatus.PENDING,
    };
    const settledPayment = { ...payment, status: PaymentStatus.SUCCEEDED };
    const tx = {
      payment: {
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        findUniqueOrThrow: jest.fn().mockResolvedValue(settledPayment),
      },
    };
    const prisma = {
      payment: {
        updateMany: jest.fn(),
        findUniqueOrThrow: jest.fn(),
      },
      $transaction: jest.fn((callback: (transaction: typeof tx) => unknown) =>
        callback(tx),
      ),
    };
    const orders = { confirmPaymentTransition: jest.fn() };
    const service = new PaymentsService(
      prisma as never,
      {} as never,
      orders as never,
      {} as never,
      { record: jest.fn() } as never,
      { paymentSucceeded: jest.fn(), paymentFailed: jest.fn() } as never,
    );

    const apply = (
      service as unknown as {
        applyConfirmationResult: (
          payment: unknown,
          actorId: string | null,
          result: unknown,
        ) => Promise<unknown>;
      }
    ).applyConfirmationResult;
    await expect(
      apply.call(service, payment, null, { success: true, raw: {} }),
    ).resolves.toEqual(settledPayment);

    expect(tx.payment.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'payment-1',
        status: { in: [PaymentStatus.PENDING, PaymentStatus.FAILED] },
      },
      data: { status: PaymentStatus.SUCCEEDED, providerPaymentRef: undefined },
    });
    expect(orders.confirmPaymentTransition).not.toHaveBeenCalled();
  });

  it('allows a later capture to settle a previously failed payment attempt', async () => {
    const payment = {
      id: 'payment-1',
      orderId: 'order-1',
      status: PaymentStatus.FAILED,
    };
    const settledPayment = { ...payment, status: PaymentStatus.SUCCEEDED };
    const tx = {
      payment: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUniqueOrThrow: jest.fn().mockResolvedValue(settledPayment),
      },
    };
    const orders = {
      confirmPaymentTransition: jest.fn().mockResolvedValue({
        userId: 'user-1',
      }),
    };
    const service = new PaymentsService(
      {
        $transaction: jest.fn((callback: (transaction: typeof tx) => unknown) =>
          callback(tx),
        ),
      } as never,
      {} as never,
      orders as never,
      {} as never,
      { record: jest.fn().mockResolvedValue(undefined) } as never,
      { paymentSucceeded: jest.fn() } as never,
    );
    const apply = (
      service as unknown as {
        applyConfirmationResult: (
          payment: unknown,
          actorId: string | null,
          result: unknown,
        ) => Promise<unknown>;
      }
    ).applyConfirmationResult;

    await expect(
      apply.call(service, payment, null, { success: true, raw: {} }),
    ).resolves.toEqual(settledPayment);

    expect(tx.payment.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'payment-1',
        status: { in: [PaymentStatus.PENDING, PaymentStatus.FAILED] },
      },
      data: { status: PaymentStatus.SUCCEEDED, providerPaymentRef: undefined },
    });
    expect(orders.confirmPaymentTransition).toHaveBeenCalled();
  });
});
