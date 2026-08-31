import { Prisma } from '@prisma/client';
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
});
