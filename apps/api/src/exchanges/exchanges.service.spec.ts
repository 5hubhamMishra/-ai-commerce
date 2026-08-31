import { ExchangeStatus, RefundStatus } from '@prisma/client';
import { ExchangesService } from './exchanges.service';

describe('ExchangesService refund reference', () => {
  it('uses the confirmed payment reference for lower-priced exchanges', async () => {
    const payment = {
      providerRef: 'order_ref_1',
      providerPaymentRef: 'pay_1',
    };
    const tx = {
      exchange: {
        create: jest.fn().mockResolvedValue({
          id: 'exchange-1',
          returnRequestId: 'return-1',
          orderId: 'order-1',
          originalVariantId: 'old-variant',
          newVariantId: 'new-variant',
          quantity: 1,
          priceDifference: -100,
          status: ExchangeStatus.APPROVED,
          carrier: null,
          trackingNumber: null,
          createdAt: new Date(),
        }),
      },
      payment: { findUniqueOrThrow: jest.fn().mockResolvedValue(payment) },
      refund: {
        create: jest.fn().mockResolvedValue({ status: RefundStatus.COMPLETED }),
      },
    };
    const provider = {
      refund: jest.fn().mockResolvedValue({
        success: true,
        providerRefundRef: 'refund-1',
        raw: {},
      }),
    };
    const service = new ExchangesService(
      {} as never,
      provider as never,
      { markExchanged: jest.fn() } as never,
      {} as never,
    );

    await service.createExchangeRecordTx(
      tx as never,
      {
        returnRequestId: 'return-1',
        orderId: 'order-1',
        originalVariantId: 'old-variant',
        newVariantId: 'new-variant',
        quantity: 1,
        priceDifference: -100,
        paymentId: 'payment-1',
        currency: 'INR',
      },
      'admin-1',
    );

    expect(provider.refund).toHaveBeenCalledWith({
      providerRef: 'pay_1',
      amount: 100,
      currency: 'INR',
      reason: 'Exchange price difference (lower-priced item)',
      idempotencyKey: 'exchange-return-1',
    });
  });
});
