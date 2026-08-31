import { PaymentStatus, Prisma } from '@prisma/client';
import { PaymentsService } from './payments.service';

describe('PaymentsService settlement race', () => {
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
        create: paymentCreate,
      },
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
      where: { id: 'payment-1', status: PaymentStatus.PENDING },
      data: { status: PaymentStatus.SUCCEEDED, providerPaymentRef: undefined },
    });
    expect(orders.confirmPaymentTransition).not.toHaveBeenCalled();
  });
});
