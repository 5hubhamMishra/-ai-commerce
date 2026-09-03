import { ExchangeStatus, RefundStatus } from '@prisma/client';
import { ExchangesService } from './exchanges.service';

describe('ExchangesService refund reference', () => {
  it('claims an awaiting-payment exchange before confirming payment', async () => {
    const exchange = {
      id: 'exchange-1',
      returnRequestId: 'return-1',
      orderId: 'order-1',
      originalVariantId: 'old-variant',
      newVariantId: 'new-variant',
      quantity: 1,
      priceDifference: 100,
      status: ExchangeStatus.AWAITING_PAYMENT,
      carrier: null,
      trackingNumber: null,
      createdAt: new Date(),
    };
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const prisma = {
      exchange: {
        findUnique: jest.fn().mockResolvedValue(exchange),
        updateMany,
      },
    };
    const service = new ExchangesService(
      prisma as never,
      {} as never,
      { record: jest.fn() } as never,
    );

    const result = await service.confirmPaymentReceived(
      'admin-1',
      'exchange-1',
    );

    expect(updateMany).toHaveBeenCalledWith({
      where: {
        id: 'exchange-1',
        status: ExchangeStatus.AWAITING_PAYMENT,
      },
      data: { status: ExchangeStatus.APPROVED },
    });
    expect(result.status).toBe(ExchangeStatus.APPROVED);
  });

  it('does not dispatch when another request wins the exchange status claim', async () => {
    const exchange = {
      id: 'exchange-1',
      returnRequestId: 'return-1',
      orderId: 'order-1',
      originalVariantId: 'old-variant',
      newVariantId: 'new-variant',
      quantity: 1,
      priceDifference: 0,
      status: ExchangeStatus.APPROVED,
      carrier: null,
      trackingNumber: null,
      createdAt: new Date(),
    };
    const updateMany = jest.fn().mockResolvedValue({ count: 0 });
    const prisma = {
      exchange: {
        findUnique: jest.fn().mockResolvedValue(exchange),
        updateMany,
      },
    };
    const audit = { record: jest.fn() };
    const service = new ExchangesService(
      prisma as never,
      {} as never,
      audit as never,
    );

    await expect(
      service.dispatch('admin-1', 'exchange-1', {
        carrier: 'DHL',
        trackingNumber: 'TRACK-1',
      }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'EXCHANGE_STATUS_CHANGED' }),
    });
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: 'exchange-1', status: ExchangeStatus.APPROVED },
      data: {
        status: ExchangeStatus.SHIPPED,
        carrier: 'DHL',
        trackingNumber: 'TRACK-1',
      },
    });
    expect(audit.record).not.toHaveBeenCalled();
  });

  it('records the pre-authorized refund for lower-priced exchanges', async () => {
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
      refund: {
        create: jest.fn().mockResolvedValue({ status: RefundStatus.COMPLETED }),
      },
    };
    const service = new ExchangesService(
      {} as never,
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
        refundResult: {
          success: true,
          providerRefundRef: 'refund-1',
          raw: {},
        },
      },
      'admin-1',
    );

    expect(tx.refund.create).toHaveBeenCalledWith({
      data: {
        orderId: 'order-1',
        paymentId: 'payment-1',
        returnRequestId: 'return-1',
        amount: 100,
        currency: 'INR',
        reason: 'Exchange price difference',
        status: RefundStatus.COMPLETED,
        providerRef: 'refund-1',
        failureReason: undefined,
      },
    });
  });
});
