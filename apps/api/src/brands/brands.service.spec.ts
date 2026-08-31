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
});
