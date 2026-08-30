import { PaymentStatus } from '@prisma/client';
import { PaymentsService } from './payments.service';

describe('PaymentsService settlement race', () => {
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
