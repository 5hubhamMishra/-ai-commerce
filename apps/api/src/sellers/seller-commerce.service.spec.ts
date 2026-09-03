import { PayoutStatus } from '@prisma/client';
import { SellerCommerceService } from './seller-commerce.service';

describe('SellerCommerceService payouts', () => {
  it('does not show earnings as paid while the payout is processing', async () => {
    const prisma = {
      sellerEarning: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'earning-1',
            grossAmount: 500,
            commissionAmount: 50,
            netAmount: 450,
            currency: 'INR',
            payoutId: 'payout-1',
            payout: { status: PayoutStatus.PROCESSING },
            orderItem: {
              productName: 'Product 1',
              sku: 'SKU-1',
              order: { id: 'order-1', status: 'DELIVERED' },
            },
          },
        ]),
        count: jest.fn().mockResolvedValue(1),
      },
    };
    const service = new SellerCommerceService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
    );
    const listEarningsForSeller = (
      service as unknown as {
        listEarningsForSeller: (
          sellerId: string,
          query: unknown,
        ) => Promise<unknown>;
      }
    ).listEarningsForSeller;

    const result = (await listEarningsForSeller.call(
      service,
      'seller-1',
      {},
    )) as { items: { status: string }[] };

    expect(result.items[0].status).toBe('PENDING');
  });

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

  it('does not combine earnings from different currencies', async () => {
    const tx = {
      sellerEarning: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'earning-inr', currency: 'INR', netAmount: 450 },
          { id: 'earning-usd', currency: 'USD', netAmount: 20 },
        ]),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      sellerPayout: {
        create: jest.fn().mockResolvedValue({
          id: 'payout-inr',
          sellerId: 'seller-1',
          amount: 450,
          currency: 'INR',
          status: PayoutStatus.PROCESSING,
        }),
        update: jest.fn().mockResolvedValue({ status: PayoutStatus.PAID }),
      },
    };
    const payoutProvider = {
      payout: jest.fn().mockResolvedValue({ success: true, raw: {} }),
    };
    const service = new SellerCommerceService(
      {
        $transaction: jest.fn((callback: (transaction: typeof tx) => unknown) =>
          callback(tx),
        ),
      } as never,
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
      where: { id: { in: ['earning-inr'] }, payoutId: null },
      data: { payoutId: 'payout-inr' },
    });
    expect(payoutProvider.payout).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 450, currency: 'INR' }),
    );
  });
});
