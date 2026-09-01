import { Prisma } from '@prisma/client';
import { BrandsService } from './brands.service';

describe('BrandsService', () => {
  it('maps a concurrent brand slug race to the duplicate conflict', async () => {
    const create = jest.fn().mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: 'test',
      }),
    );
    const prisma = {
      brand: {
        findUnique: jest.fn().mockResolvedValue(null),
        create,
      },
    } as unknown as ConstructorParameters<typeof BrandsService>[0];
    const service = new BrandsService(
      prisma,
      {} as ConstructorParameters<typeof BrandsService>[1],
      {} as ConstructorParameters<typeof BrandsService>[2],
      {} as ConstructorParameters<typeof BrandsService>[3],
    );

    await expect(
      service.create({ name: 'Acme', slug: 'acme' }, 'actor1'),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'BRAND_SLUG_TAKEN' }),
    });
    expect(create).toHaveBeenCalled();
  });

  it('rejects a stale brand update', async () => {
    const updatedAt = new Date('2026-09-01T00:00:00.000Z');
    const brandUpdateMany = jest.fn().mockResolvedValue({ count: 0 });
    const prisma = {
      brand: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'brand-1',
          deletedAt: null,
          updatedAt,
        }),
        updateMany: brandUpdateMany,
      },
    };
    const service = new BrandsService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await expect(
      service.update('brand-1', { name: 'New name' }, 'actor1'),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'BRAND_CHANGED' }),
    });
    expect(brandUpdateMany).toHaveBeenCalledWith({
      where: { id: 'brand-1', updatedAt },
      data: {
        name: 'New name',
        slug: undefined,
        description: undefined,
        logoUrl: undefined,
        isActive: undefined,
      },
    });
  });

  it('rejects a stale brand deletion', async () => {
    const updatedAt = new Date('2026-09-01T00:00:00.000Z');
    const brandUpdateMany = jest.fn().mockResolvedValue({ count: 0 });
    const prisma = {
      brand: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'brand-1',
          deletedAt: null,
          updatedAt,
        }),
        updateMany: brandUpdateMany,
      },
      product: { count: jest.fn().mockResolvedValue(0) },
    };
    const service = new BrandsService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await expect(service.remove('brand-1', 'actor1')).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'BRAND_CHANGED' }),
    });
    expect(brandUpdateMany).toHaveBeenCalledWith({
      where: { id: 'brand-1', updatedAt },
      data: { deletedAt: expect.any(Date) },
    });
  });
});
