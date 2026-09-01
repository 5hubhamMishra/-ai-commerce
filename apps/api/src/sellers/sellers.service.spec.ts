import { Prisma, SellerStatus } from '@prisma/client';
import { SellersService } from './sellers.service';

describe('SellersService', () => {
  it('maps a concurrent storefront slug race to the duplicate conflict', async () => {
    const create = jest.fn().mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: 'test',
        meta: { target: ['slug'] },
      }),
    );
    const prisma = {
      seller: { findUnique: jest.fn().mockResolvedValue(null), create },
      $transaction: jest.fn((callback: (tx: unknown) => unknown) =>
        callback(prisma),
      ),
    } as unknown as ConstructorParameters<typeof SellersService>[0];
    const service = new SellersService(
      prisma,
      { get: jest.fn().mockReturnValue(1000) } as ConstructorParameters<
        typeof SellersService
      >[1],
      {} as ConstructorParameters<typeof SellersService>[2],
      {} as ConstructorParameters<typeof SellersService>[3],
      {} as ConstructorParameters<typeof SellersService>[4],
      {} as ConstructorParameters<typeof SellersService>[5],
      {} as ConstructorParameters<typeof SellersService>[6],
    );

    await expect(
      service.apply('user1', { businessName: 'Acme Store' }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'SELLER_SLUG_TAKEN' }),
    });
    expect(create).toHaveBeenCalled();
  });

  it('does not deactivate listings when suspension loses its status claim', async () => {
    const sellerUpdateMany = jest.fn().mockResolvedValue({ count: 0 });
    const productUpdateMany = jest.fn();
    const prisma = {
      $transaction: jest.fn((callback: (tx: unknown) => unknown) =>
        callback({
          seller: { updateMany: sellerUpdateMany },
          product: { updateMany: productUpdateMany },
        }),
      ),
    };
    const service = new SellersService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    (service as unknown as { getRow: jest.Mock }).getRow = jest
      .fn()
      .mockResolvedValue({
        id: 'seller-1',
        status: SellerStatus.VERIFIED,
      });

    await expect(
      service.suspend('admin-1', 'seller-1', { reason: 'Policy violation' }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'SELLER_STATUS_CHANGED' }),
    });
    expect(sellerUpdateMany).toHaveBeenCalledWith({
      where: { id: 'seller-1', status: SellerStatus.VERIFIED },
      data: {
        status: SellerStatus.SUSPENDED,
        suspendReason: 'Policy violation',
      },
    });
    expect(productUpdateMany).not.toHaveBeenCalled();
  });

  it('rejects reinstatement when another moderation update wins', async () => {
    const sellerUpdateMany = jest.fn().mockResolvedValue({ count: 0 });
    const prisma = {
      seller: { updateMany: sellerUpdateMany },
    };
    const service = new SellersService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    (service as unknown as { getRow: jest.Mock }).getRow = jest
      .fn()
      .mockResolvedValue({ id: 'seller-1', status: SellerStatus.SUSPENDED });

    await expect(
      service.reinstate('admin-1', 'seller-1'),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'SELLER_STATUS_CHANGED' }),
    });
    expect(sellerUpdateMany).toHaveBeenCalledWith({
      where: { id: 'seller-1', status: SellerStatus.SUSPENDED },
      data: { status: SellerStatus.VERIFIED, suspendReason: null },
    });
  });

  it('rejects a stale seller rejection without notifying the owner', async () => {
    const sellerUpdateMany = jest.fn().mockResolvedValue({ count: 0 });
    const notifications = { create: jest.fn() };
    const audit = { record: jest.fn() };
    const service = new SellersService(
      { seller: { updateMany: sellerUpdateMany } } as never,
      {} as never,
      {} as never,
      audit as never,
      notifications as never,
      {} as never,
      {} as never,
    );
    (service as unknown as { getRow: jest.Mock }).getRow = jest
      .fn()
      .mockResolvedValue({
        id: 'seller-1',
        status: SellerStatus.PENDING_VERIFICATION,
      });

    await expect(
      service.reject('admin-1', 'seller-1', { reason: 'Incomplete documents' }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'SELLER_STATUS_CHANGED' }),
    });
    expect(sellerUpdateMany).toHaveBeenCalledWith({
      where: { id: 'seller-1', status: SellerStatus.PENDING_VERIFICATION },
      data: {
        status: SellerStatus.REJECTED,
        rejectReason: 'Incomplete documents',
      },
    });
    expect(notifications.create).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
  });
});
