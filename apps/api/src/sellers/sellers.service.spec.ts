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
    );

    await expect(
      service.apply('user1', { businessName: 'Acme Store' }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'SELLER_SLUG_TAKEN' }),
    });
    expect(create).toHaveBeenCalled();
  });

  it('rejects a stale seller profile update', async () => {
    const updatedAt = new Date('2026-09-01T00:00:00.000Z');
    const updateMany = jest.fn().mockResolvedValue({ count: 0 });
    const prisma = {
      seller: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'seller-1',
          businessName: 'Acme Store',
          updatedAt,
        }),
        updateMany,
      },
    };
    const service = new SellersService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await expect(
      service.updateOwn('owner-1', { description: 'New description' }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'SELLER_PROFILE_CHANGED' }),
    });
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: 'seller-1', updatedAt },
      data: {
        businessName: undefined,
        slug: undefined,
        description: 'New description',
        logoUrl: undefined,
        bannerUrl: undefined,
      },
    });
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
      $transaction: jest.fn((callback: (tx: unknown) => unknown) =>
        callback({ seller: { updateMany: sellerUpdateMany } }),
      ),
    };
    const service = new SellersService(
      prisma as never,
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
      data: {
        status: SellerStatus.VERIFIED,
        verifiedAt: expect.any(Date),
        suspendReason: null,
      },
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

  it('does not verify a seller after its status changes', async () => {
    const sellerUpdateMany = jest.fn().mockResolvedValue({ count: 0 });
    const audit = { record: jest.fn() };
    const notifications = { create: jest.fn() };
    const service = new SellersService(
      {
        $transaction: jest.fn((callback: (tx: unknown) => unknown) =>
          callback({
            seller: { updateMany: sellerUpdateMany },
          }),
        ),
      } as never,
      {} as never,
      {} as never,
      audit as never,
      notifications as never,
      {} as never,
    );
    (service as unknown as { getRow: jest.Mock }).getRow = jest
      .fn()
      .mockResolvedValue({ id: 'seller-1', status: SellerStatus.REJECTED });

    await expect(service.verify('admin-1', 'seller-1')).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'SELLER_STATUS_CHANGED' }),
    });
    expect(sellerUpdateMany).toHaveBeenCalledWith({
      where: { id: 'seller-1', status: SellerStatus.REJECTED },
      data: { status: SellerStatus.VERIFIED, verifiedAt: expect.any(Date) },
    });
    expect(notifications.create).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
  });

  it('provisions the first warehouse inside the verification transaction', async () => {
    const sellerUpdateMany = jest.fn().mockResolvedValue({ count: 1 });
    const seller = {
      id: 'seller-1',
      ownerUserId: 'owner-1',
      businessName: 'Acme Store',
      status: SellerStatus.VERIFIED,
    };
    const warehouseCreate = jest.fn().mockResolvedValue({
      id: 'warehouse-1',
      name: 'Acme Store Fulfillment',
      code: 'SELLER-SELLER-1',
    });
    const audit = { record: jest.fn() };
    const notifications = { create: jest.fn() };
    const transaction = jest.fn((callback: (tx: unknown) => unknown) =>
      callback({
        seller: {
          updateMany: sellerUpdateMany,
          findUniqueOrThrow: jest.fn().mockResolvedValue(seller),
        },
        warehouse: {
          findFirst: jest.fn().mockResolvedValue(null),
          create: warehouseCreate,
        },
      }),
    );
    const service = new SellersService(
      { $transaction: transaction } as never,
      {} as never,
      {} as never,
      audit as never,
      notifications as never,
      {} as never,
    );
    (service as unknown as { getRow: jest.Mock }).getRow = jest
      .fn()
      .mockResolvedValue({ id: 'seller-1', status: SellerStatus.REJECTED });

    await service.verify('admin-1', 'seller-1');

    expect(transaction).toHaveBeenCalledTimes(1);
    expect(warehouseCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ sellerId: 'seller-1' }),
    });
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'WAREHOUSE_CREATED',
        entityId: 'warehouse-1',
      }),
    );
  });

  it('does not apply a provider rejection after moderation changes status', async () => {
    const sellerUpdateMany = jest.fn().mockResolvedValue({ count: 0 });
    const service = new SellersService(
      { seller: { updateMany: sellerUpdateMany } } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    const applyVerificationResult = (
      service as unknown as {
        applyVerificationResult: (
          sellerId: string,
          result: unknown,
        ) => Promise<unknown>;
      }
    ).applyVerificationResult;

    await expect(
      applyVerificationResult.call(service, 'seller-1', {
        status: 'REJECTED',
        reason: 'Provider mismatch',
      }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'SELLER_STATUS_CHANGED' }),
    });
    expect(sellerUpdateMany).toHaveBeenCalledWith({
      where: { id: 'seller-1', status: SellerStatus.PENDING_VERIFICATION },
      data: {
        status: SellerStatus.REJECTED,
        rejectReason: 'Provider mismatch',
      },
    });
  });
});
