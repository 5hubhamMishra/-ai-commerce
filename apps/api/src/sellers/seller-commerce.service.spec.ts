import { PayoutStatus } from '@prisma/client';
import { SellerCommerceService } from './seller-commerce.service';

describe('SellerCommerceService payouts', () => {
  it('claims earnings before paying and passes a stable provider key', async () => {
    const processingPayout = {
      id: 'payout-1',
      sellerId: 'seller-1',
      amount: 450,
      currency: 'INR',
      status: PayoutStatus.PROCESSING,
    };
    const paidPayout = { ...processingPayout, status: PayoutStatus.PAID };
    const tx = {
      sellerEarning: {
        findMany: jest
          .fn()
          .mockResolvedValue([
            { id: 'earning-1', currency: 'INR', netAmount: 450 },
          ]),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      sellerPayout: {
        create: jest.fn().mockResolvedValue(processingPayout),
        update: jest.fn().mockResolvedValue(paidPayout),
      },
    };
    const prisma = {
      $transaction: jest.fn((callback: (transaction: typeof tx) => unknown) =>
        callback(tx),
      ),
    };
    const payoutProvider = {
      payout: jest.fn().mockResolvedValue({
        success: true,
        providerRef: 'provider-payout-1',
        raw: {},
      }),
    };
    const service = new SellerCommerceService(
      prisma as never,
      {} as never,
      payoutProvider,
      { record: jest.fn().mockResolvedValue(undefined) } as never,
    );

    await service.createPayout('admin-1', 'seller-1');

    expect(tx.sellerPayout.create).toHaveBeenCalledWith({
      data: {
        sellerId: 'seller-1',
        amount: 450,
        currency: 'INR',
        status: PayoutStatus.PROCESSING,
      },
    });
    expect(tx.sellerEarning.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['earning-1'] }, payoutId: null },
      data: { payoutId: 'payout-1' },
    });
    expect(payoutProvider.payout).toHaveBeenCalledWith({
      sellerId: 'seller-1',
      amount: 450,
      currency: 'INR',
      idempotencyKey: 'seller-payout-payout-1',
    });
  });
});
